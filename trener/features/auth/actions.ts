"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/infrastructure/db/client";
import { hashPassword, verifyPassword } from "./password";
import { createSession, destroySession } from "./session";

export type AuthFormState = { error?: string };

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
