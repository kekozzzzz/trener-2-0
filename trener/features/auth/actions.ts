"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/infrastructure/db/client";
import { hashPassword, verifyPassword } from "./password";
import { createSession, destroySession, requireSession } from "./session";
import { clientIp, hitCount, recordHit, clearHits } from "./rate-limit";
import {
  generateResetToken,
  hashResetToken,
  buildResetLink,
  buildResetEmail,
} from "./password-reset";
import { safeSendEmail } from "@/infrastructure/adapters/email";
import {
  isAuthRateLimitEnabled,
  getLoginMaxFailuresPerEmail,
  getLoginMaxFailuresPerIp,
  getLoginWindowMs,
  getRegisterMaxPerIp,
  getRegisterWindowMs,
  getPasswordResetTtlMs,
  getPasswordResetMaxPerIp,
  getPasswordResetWindowMs,
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
  // sessionsValidFrom ставим явно из JS-времени (а не DB-default now()): TIMESTAMP(3)
  // в БД округляет до мс ВВЕРХ, а iat куки — JS-мс ВНИЗ, и в пределах одной мс метка
  // могла бы оказаться больше iat → свежая сессия сразу отвергалась бы. createSession
  // ниже возьмёт iat уже после create — он не меньше этой метки.
  const player = await prisma.player.create({
    data: { email, passwordHash, termsAcceptedAt: new Date(), sessionsValidFrom: new Date() },
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

  // Сдвигаем sessionsValidFrom — все ранее выданные куки (включая возможную
  // угнанную) становятся недействительны. passwordChangedAt — для показа в кабинете.
  const now = new Date();
  const newHash = await hashPassword(newPassword);
  await prisma.player.update({
    where: { id: session.playerId },
    data: { passwordHash: newHash, passwordChangedAt: now, sessionsValidFrom: now },
  });

  // Текущему устройству выдаём свежую сессию — сменивший пароль остаётся в системе,
  // слетают только остальные. iat новой куки > sessionsValidFrom, поэтому она валидна.
  await createSession(session.playerId);

  return { success: true };
}

// Запрос сброса пароля: шлём на email одноразовую ссылку. Ответ всегда одинаковый
// (success), существует email или нет — чтобы форма не работала «прозвоном» чужих
// почт (07-безопасность.md, раздел 2). Письмо шлём сразу (не через очередь): так
// сырой токен нигде не сохраняется, кроме самого письма (в базе — только его SHA-256).
export async function requestPasswordResetAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Введи правильный email" };

  // Лимит запросов: по IP и по email — против заваливания ящика и перебора почт.
  const limited = isAuthRateLimitEnabled();
  const ipKey = limited ? `reset-ip:${await clientIp()}` : "";
  const emailKey = `reset-email:${email}`;
  const overLimit =
    limited &&
    (hitCount(ipKey) >= getPasswordResetMaxPerIp() || hitCount(emailKey) >= getPasswordResetMaxPerIp());

  if (!overLimit) {
    if (limited) {
      recordHit(ipKey, getPasswordResetWindowMs());
      recordHit(emailKey, getPasswordResetWindowMs());
    }

    const player = await prisma.player.findFirst({
      where: { email, closedAt: null },
      select: { id: true },
    });
    if (player) {
      // Гасим прежние неиспользованные токены игрока — действительна только свежая ссылка.
      await prisma.passwordResetToken.updateMany({
        where: { playerId: player.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      const { raw, hash } = generateResetToken();
      await prisma.passwordResetToken.create({
        data: { playerId: player.id, tokenHash: hash, expiresAt: new Date(Date.now() + getPasswordResetTtlMs()) },
      });
      // Мягкая отправка: ошибку доставки наружу не выносим (не раскрываем, был ли email).
      await safeSendEmail(buildResetEmail(email, buildResetLink(raw)));
    }
  }

  // Одинаковый ответ при любом исходе (нет email / лимит / отправлено).
  return { success: true };
}

// Установка нового пароля по одноразовой ссылке. Токен из письма проверяем по его
// SHA-256, на годность (не использован, не истёк) и принадлежность живому аккаунту.
// Смена пароля гасит все старые сессии (sessionsValidFrom) — на случай, если сброс
// делают из-за того, что доступ увели.
export async function resetPasswordAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const token = String(formData.get("token") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const newPasswordConfirm = String(formData.get("newPasswordConfirm") ?? "");

  if (newPassword.length < MIN_PASSWORD_LENGTH) return { error: "Пароль должен быть не короче 8 символов" };
  if (newPassword !== newPasswordConfirm) return { error: "Пароли не совпадают" };

  const INVALID = "Ссылка недействительна или устарела. Запроси сброс пароля заново.";
  if (!token) return { error: INVALID };

  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
    select: { playerId: true, usedAt: true, expiresAt: true },
  });
  if (!row || row.usedAt || row.expiresAt < new Date()) return { error: INVALID };

  // Аккаунт мог быть закрыт (анонимизирован) после запроса — такой не восстанавливаем.
  const player = await prisma.player.findFirst({
    where: { id: row.playerId, closedAt: null },
    select: { id: true },
  });
  if (!player) return { error: INVALID };

  const now = new Date();
  const newHash = await hashPassword(newPassword);
  // Одной транзакцией: новый пароль (+ инвалидация старых сессий) и гашение всех
  // токенов игрока (использованную ссылку и любые другие нельзя применить повторно).
  await prisma.$transaction([
    prisma.player.update({
      where: { id: player.id },
      data: { passwordHash: newHash, passwordChangedAt: now, sessionsValidFrom: now },
    }),
    prisma.passwordResetToken.updateMany({
      where: { playerId: player.id, usedAt: null },
      data: { usedAt: now },
    }),
  ]);

  redirect("/login?reset=1");
}

// Выход на всех устройствах: сдвигаем sessionsValidFrom — гаснут ВСЕ сессии, включая
// текущую (буквально «выйти на всех»), и уводим на вход. Подтверждения паролем не
// требует — это безопасное действие (только разлогинивает), доступно вошедшему игроку.
export async function logoutEverywhereAction(): Promise<void> {
  const session = await requireSession();

  await prisma.player.update({
    where: { id: session.playerId },
    data: { sessionsValidFrom: new Date() },
  });

  await destroySession();
  redirect("/login");
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
