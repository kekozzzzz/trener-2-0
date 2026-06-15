"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/infrastructure/db/client";
import { hashPassword, verifyPassword } from "./password";
import { createSession, destroySession, requireSession } from "./session";

export type AuthFormState = { error?: string; success?: boolean };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

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

  const existing = await prisma.player.findUnique({ where: { email } });
  if (existing) return { error: "Этот email уже зарегистрирован" };

  const passwordHash = await hashPassword(password);
  const player = await prisma.player.create({
    data: { email, passwordHash, termsAcceptedAt: new Date() },
  });

  await createSession(player.id);
  redirect("/");
}

export async function loginAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const player = await prisma.player.findUnique({ where: { email } });
  const valid = player?.passwordHash ? await verifyPassword(password, player.passwordHash) : false;

  if (!player || !valid) return { error: "Неверный email или пароль" };

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
