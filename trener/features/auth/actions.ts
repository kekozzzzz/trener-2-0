"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/infrastructure/db/client";
import { hashPassword, verifyPassword } from "./password";
import { createSession, destroySession, requireSession } from "./session";
import { clientIp, hitCount, recordHit, clearHits } from "./rate-limit";
import {
  isAuthRateLimitEnabled,
  getLoginMaxFailuresPerEmail,
  getLoginMaxFailuresPerIp,
  getLoginWindowMs,
  getRegisterMaxPerIp,
  getRegisterWindowMs,
} from "@/config/auth";

export type AuthFormState = { error?: string; success?: boolean };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const TOO_MANY_ATTEMPTS = "Слишком много попыток. Подождите несколько минут и попробуйте снова.";

export async function registerAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  const termsAccepted = formData.get("terms") === "on";

  if (!EMAIL_RE.test(email)) return { error: "Введи правильный email" };
  if (password.length < MIN_PASSWORD_LENGTH) return { error: "Пароль должен быть не короче 8 символов" };
  if (password !== passwordConfirm) return { error: "Пароли не совпадают" };
  if (!termsAccepted) return { error: "Нужно согласиться с условиями обработки данных" };

  // Лимит регистраций по IP (architecture/07-безопасность.md, раздел 2): тормоз
  // массового создания фейков и «прозвона» занятых email. Считаем КАЖДУЮ попытку,
  // включая упор в занятый email ниже, — иначе перебор существующих почт не
  // ограничивался бы. Проверка до запроса в БД, чтобы заблокированный не нагружал её.
  const limited = isAuthRateLimitEnabled();
  const registerIpKey = limited ? `register-ip:${await clientIp()}` : "";
  if (limited && hitCount(registerIpKey) >= getRegisterMaxPerIp()) {
    return { error: TOO_MANY_ATTEMPTS };
  }

  const existing = await prisma.player.findUnique({ where: { email } });
  if (existing) {
    if (limited) recordHit(registerIpKey, getRegisterWindowMs());
    return { error: "Этот email уже зарегистрирован" };
  }

  const passwordHash = await hashPassword(password);
  const player = await prisma.player.create({
    data: { email, passwordHash, termsAcceptedAt: new Date() },
  });

  if (limited) recordHit(registerIpKey, getRegisterWindowMs());
  await createSession(player.id);
  redirect("/");
}

export async function loginAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  // Лимит на перебор пароля (architecture/07-безопасность.md, раздел 2): блок по
  // email (точечно защищает конкретный аккаунт) и по IP (против credential
  // stuffing). Проверяем ДО verifyPassword — заблокированный не тратит bcrypt.
  const limited = isAuthRateLimitEnabled();
  const loginEmailKey = `login-email:${email}`;
  const loginIpKey = limited ? `login-ip:${await clientIp()}` : "";
  if (
    limited &&
    (hitCount(loginEmailKey) >= getLoginMaxFailuresPerEmail() ||
      hitCount(loginIpKey) >= getLoginMaxFailuresPerIp())
  ) {
    return { error: TOO_MANY_ATTEMPTS };
  }

  const player = await prisma.player.findUnique({ where: { email } });
  const valid = player?.passwordHash ? await verifyPassword(password, player.passwordHash) : false;

  if (!player || !valid) {
    if (limited) {
      recordHit(loginEmailKey, getLoginWindowMs());
      recordHit(loginIpKey, getLoginWindowMs());
    }
    return { error: "Неверный email или пароль" };
  }

  // Успех — снимаем счётчик email (по IP не трогаем: с того же IP мог идти
  // перебор других аккаунтов, и один верный вход его не обеляет).
  if (limited) clearHits(loginEmailKey);
  await createSession(player.id);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}

export async function changePasswordAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const session = await requireSession();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const newPasswordConfirm = String(formData.get("newPasswordConfirm") ?? "");

  if (newPassword.length < MIN_PASSWORD_LENGTH) return { error: "Новый пароль должен быть не короче 8 символов" };
  if (newPassword !== newPasswordConfirm) return { error: "Новые пароли не совпадают" };
  if (newPassword === currentPassword) return { error: "Новый пароль совпадает с текущим" };

  const player = await prisma.player.findUnique({ where: { id: session.playerId } });
  const valid = player?.passwordHash ? await verifyPassword(currentPassword, player.passwordHash) : false;
  if (!valid) return { error: "Неверный текущий пароль" };

  await prisma.player.update({
    where: { id: session.playerId },
    data: { passwordHash: await hashPassword(newPassword) },
  });

  return { success: true };
}

// Закрытие аккаунта — мягкое (запрет 5): физического DELETE нет.
// Ставим closedAt и анонимизируем (email/passwordHash → NULL), турниры остаются
// (Tournament.player onDelete: Restrict). Подтверждение — текущим паролем.
export async function closeAccountAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const session = await requireSession();
  const password = String(formData.get("password") ?? "");

  const player = await prisma.player.findUnique({ where: { id: session.playerId } });
  const valid = player?.passwordHash ? await verifyPassword(password, player.passwordHash) : false;
  if (!valid) return { error: "Неверный пароль" };

  await prisma.player.update({
    where: { id: session.playerId },
    data: { closedAt: new Date(), email: null, passwordHash: null },
  });

  await destroySession();
  redirect("/");
}
