"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/infrastructure/db/client";
import { hashPassword, verifyPassword } from "./password";
import {
  createSession,
  destroySession,
  requireSession,
  readPendingRegistration,
  clearPendingRegistration,
} from "./session";
import { clientIp, hitCount, recordHit, clearHits } from "./rate-limit";
import { recordAuthEvent } from "./auth-events";
import {
  generateResetToken,
  hashResetToken,
  buildResetLink,
  buildResetEmail,
} from "./password-reset";
import { generateMagicToken, buildMagicLink, buildMagicLinkEmail } from "./magic-link";
import {
  generateClosureToken,
  hashClosureToken,
  buildClosureLink,
  buildClosureEmail,
} from "./account-closure";
import { buildWelcomeEmail, buildPasswordChangedEmail } from "./auth-emails";
import { safeSendEmail } from "@/infrastructure/adapters/email";
import { getUserLocale } from "@/i18n/locale";
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
  getMagicLinkTtlMs,
  getMagicLinkMaxPerIp,
  getMagicLinkMaxPerEmail,
  getMagicLinkWindowMs,
  getAccountClosureTtlMs,
} from "@/config/auth";

export type AuthFormState = { error?: string; success?: boolean };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_NICKNAME_LENGTH = 40;

// Ник для показа в разборах. Необязательный, обрезаем по длине; пустой → null.
// В LLM не передаётся (приватность) — только отображение пользователю.
function normalizeNickname(raw: FormDataEntryValue | null): string | null {
  const value = String(raw ?? "").trim().slice(0, MAX_NICKNAME_LENGTH);
  return value.length > 0 ? value : null;
}

export async function registerAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const t = await getTranslations("Errors");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  const nickname = normalizeNickname(formData.get("nickname"));
  const termsAccepted = formData.get("terms") === "on";

  if (!EMAIL_RE.test(email)) return { error: t("invalidEmail") };
  if (password.length < MIN_PASSWORD_LENGTH) return { error: t("passwordTooShort") };
  if (password !== passwordConfirm) return { error: t("passwordsDontMatch") };
  if (!termsAccepted) return { error: t("termsRequired") };

  // Лимит регистраций по IP (architecture/07-безопасность.md, раздел 2): тормоз
  // массового создания фейков и «прозвона» занятых email. Считаем КАЖДУЮ попытку,
  // включая упор в занятый email ниже, — иначе перебор существующих почт не
  // ограничивался бы. Проверка до запроса в БД, чтобы заблокированный не нагружал её.
  const limited = isAuthRateLimitEnabled();
  const registerIpKey = limited ? `register-ip:${await clientIp()}` : "";
  if (limited && hitCount(registerIpKey) >= getRegisterMaxPerIp()) {
    return { error: t("tooManyAttempts") };
  }

  const existing = await prisma.player.findUnique({ where: { email } });
  if (existing) {
    if (limited) recordHit(registerIpKey, getRegisterWindowMs());
    return { error: t("emailTaken") };
  }

  const passwordHash = await hashPassword(password);
  // Язык интерфейса гостя (кука → браузер) — фиксируем в Player и используем для письма.
  const locale = await getUserLocale();
  // sessionsValidFrom ставим явно из JS-времени (а не DB-default now()): TIMESTAMP(3)
  // в БД округляет до мс ВВЕРХ, а iat куки — JS-мс ВНИЗ, и в пределах одной мс метка
  // могла бы оказаться больше iat → свежая сессия сразу отвергалась бы. createSession
  // ниже возьмёт iat уже после create — он не меньше этой метки.
  const player = await prisma.player.create({
    data: { email, passwordHash, nickname, locale, termsAcceptedAt: new Date(), sessionsValidFrom: new Date() },
  });

  if (limited) recordHit(registerIpKey, getRegisterWindowMs());
  await recordAuthEvent("REGISTER", player.id);
  // Мягкое приветствие: письмо вторично, доступ не блокирует. Шлём до createSession
  // (он редиректит и прервёт выполнение), ошибку доставки safeSendEmail глушит.
  await safeSendEmail(buildWelcomeEmail(email, locale));
  await createSession(player.id);
  // Новичка ведём сразу к делу — на загрузку первого турнира (QA 2026-07-05, пункт 9).
  redirect("/analyze");
}

// Изменить покерный ник в личном кабинете (показ в разборах). Пустое значение
// очищает ник (вернётся «Hero»). Только для своей записи (requireSession).
// Возвращает результат, чтобы форма показала подтверждение сохранения.
export type NicknameFormState = { saved?: "set" | "cleared" };

export async function updateNicknameAction(
  _prevState: NicknameFormState,
  formData: FormData,
): Promise<NicknameFormState> {
  const { playerId } = await requireSession();
  const nickname = normalizeNickname(formData.get("nickname"));
  await prisma.player.update({ where: { id: playerId }, data: { nickname } });
  revalidatePath("/account");
  return { saved: nickname ? "set" : "cleared" };
}

export async function loginAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const t = await getTranslations("Errors");
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
    return { error: t("tooManyAttempts") };
  }

  const player = await prisma.player.findUnique({ where: { email } });
  const valid = player?.passwordHash ? await verifyPassword(password, player.passwordHash) : false;

  if (!player || !valid) {
    if (limited) {
      recordHit(loginEmailKey, getLoginWindowMs());
      recordHit(loginIpKey, getLoginWindowMs());
    }
    // Журнал попыток (07-безопасность.md): пишется только до порога лимитера —
    // заблокированные попытки отсекаются выше и базу не раздувают.
    await recordAuthEvent("LOGIN_FAILED", player?.id ?? null);
    return { error: t("wrongEmailOrPassword") };
  }

  // Успех — снимаем счётчик email (по IP не трогаем: с того же IP мог идти
  // перебор других аккаунтов, и один верный вход его не обеляет).
  if (limited) clearHits(loginEmailKey);
  await recordAuthEvent("LOGIN_PASSWORD", player.id);
  await createSession(player.id);
  // Вернувшегося — к его турнирам, а не на маркетинговый лендинг (QA 2026-07-05).
  redirect("/tournaments");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}

export async function changePasswordAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const t = await getTranslations("Errors");
  const session = await requireSession();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const newPasswordConfirm = String(formData.get("newPasswordConfirm") ?? "");

  if (newPassword.length < MIN_PASSWORD_LENGTH) return { error: t("newPasswordTooShort") };
  if (newPassword !== newPasswordConfirm) return { error: t("newPasswordsDontMatch") };
  if (newPassword === currentPassword) return { error: t("newPasswordSameAsCurrent") };

  const player = await prisma.player.findUnique({ where: { id: session.playerId } });
  const valid = player?.passwordHash ? await verifyPassword(currentPassword, player.passwordHash) : false;
  if (!valid) return { error: t("wrongCurrentPassword") };

  // Сдвигаем sessionsValidFrom — все ранее выданные куки (включая возможную
  // угнанную) становятся недействительны. passwordChangedAt — для показа в кабинете.
  const now = new Date();
  const newHash = await hashPassword(newPassword);
  await prisma.player.update({
    where: { id: session.playerId },
    data: { passwordHash: newHash, passwordChangedAt: now, sessionsValidFrom: now },
  });

  // Уведомление безопасности — при уведённом доступе человек заметит чужую смену.
  if (player?.email) await safeSendEmail(buildPasswordChangedEmail(player.email, now, await getUserLocale()));

  // Текущему устройству выдаём свежую сессию — сменивший пароль остаётся в системе,
  // слетают только остальные. iat новой куки > sessionsValidFrom, поэтому она валидна.
  await createSession(session.playerId);

  return { success: true };
}

// Задать первый пароль — для аккаунтов, заведённых по «волшебной ссылке» (passwordHash
// NULL). В отличие от смены, текущий пароль не спрашиваем (его нет). Другие сессии НЕ
// гасим: пароль только добавлен (не «угнан»), живые сессии — это сам игрок.
export async function setPasswordAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const t = await getTranslations("Errors");
  const session = await requireSession();
  const newPassword = String(formData.get("newPassword") ?? "");
  const newPasswordConfirm = String(formData.get("newPasswordConfirm") ?? "");

  if (newPassword.length < MIN_PASSWORD_LENGTH) return { error: t("passwordTooShort") };
  if (newPassword !== newPasswordConfirm) return { error: t("passwordsDontMatch") };

  const player = await prisma.player.findUnique({
    where: { id: session.playerId },
    select: { passwordHash: true, email: true },
  });
  // Защита от гонки/обхода: если пароль уже есть — это смена (нужен текущий), не «задать».
  if (player?.passwordHash) return { error: t("passwordAlreadySet") };

  const now = new Date();
  const newHash = await hashPassword(newPassword);
  await prisma.player.update({
    where: { id: session.playerId },
    data: { passwordHash: newHash, passwordChangedAt: now },
  });

  if (player?.email) await safeSendEmail(buildPasswordChangedEmail(player.email, now, await getUserLocale()));
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
  const t = await getTranslations("Errors");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: t("invalidEmail") };

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
      await safeSendEmail(buildResetEmail(email, buildResetLink(raw), await getUserLocale()));
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
  const t = await getTranslations("Errors");
  const token = String(formData.get("token") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const newPasswordConfirm = String(formData.get("newPasswordConfirm") ?? "");

  if (newPassword.length < MIN_PASSWORD_LENGTH) return { error: t("passwordTooShort") };
  if (newPassword !== newPasswordConfirm) return { error: t("passwordsDontMatch") };

  const INVALID = t("resetLinkInvalid");
  if (!token) return { error: INVALID };

  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
    select: { playerId: true, usedAt: true, expiresAt: true },
  });
  if (!row || row.usedAt || row.expiresAt < new Date()) return { error: INVALID };

  // Аккаунт мог быть закрыт (анонимизирован) после запроса — такой не восстанавливаем.
  const player = await prisma.player.findFirst({
    where: { id: row.playerId, closedAt: null },
    select: { id: true, email: true },
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

  // Уведомление безопасности (после коммита, до редиректа — redirect бросает исключение).
  if (player.email) await safeSendEmail(buildPasswordChangedEmail(player.email, now, await getUserLocale()));

  redirect("/login?reset=1");
}

// ─────────────── Вход/регистрация по «волшебной ссылке» (passwordless) ───────────────

// Запрос ссылки входа: шлём на email одноразовую короткоживущую ссылку. В отличие от
// сброса пароля, письмо уходит на ЛЮБОЙ корректный email (новый = регистрация), какой
// именно случай — решит клик. Ответ всегда одинаковый (success) — форма не раскрывает,
// есть ли уже такой аккаунт. Письмо шлём сразу (не через очередь): сырой токен нигде
// не сохраняется, кроме письма (в базе — только его SHA-256).
export async function requestMagicLinkAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const t = await getTranslations("Errors");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: t("invalidEmail") };

  const limited = isAuthRateLimitEnabled();
  const ipKey = limited ? `magic-ip:${await clientIp()}` : "";
  const emailKey = `magic-email:${email}`;
  const overLimit =
    limited &&
    (hitCount(ipKey) >= getMagicLinkMaxPerIp() || hitCount(emailKey) >= getMagicLinkMaxPerEmail());

  if (!overLimit) {
    if (limited) {
      recordHit(ipKey, getMagicLinkWindowMs());
      recordHit(emailKey, getMagicLinkWindowMs());
    }
    // Гасим прежние неиспользованные ссылки этого email — рабочая только свежая.
    await prisma.magicLinkToken.updateMany({
      where: { email, usedAt: null },
      data: { usedAt: new Date() },
    });
    const { raw, hash } = generateMagicToken();
    await prisma.magicLinkToken.create({
      data: { email, tokenHash: hash, expiresAt: new Date(Date.now() + getMagicLinkTtlMs()) },
    });
    // Мягкая отправка: ошибку доставки наружу не выносим (не раскрываем исход).
    await safeSendEmail(buildMagicLinkEmail(email, buildMagicLink(raw), await getUserLocale()));
  }

  // Одинаковый ответ при любом исходе (нет аккаунта / есть / лимит / отправлено).
  return { success: true };
}

// Завершение регистрации по «волшебной ссылке»: токен уже проверен и погашен в
// GET-роуте /enter/verify, подтверждённый email лежит в подписанной cookie намерения.
// Здесь добираем согласие на обработку данных (обязательно, 07-безопасность.md) и ник,
// создаём аккаунт без пароля и выдаём сессию. Пароля у такого аккаунта нет — вход
// дальше по ссылке или через «забыл пароль» (passwordHash остаётся NULL).
export async function completeRegistrationAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const t = await getTranslations("Errors");
  const email = await readPendingRegistration();
  if (!email || !EMAIL_RE.test(email)) {
    return { error: t("magicLinkExpired") };
  }
  const nickname = normalizeNickname(formData.get("nickname"));
  const termsAccepted = formData.get("terms") === "on";
  if (!termsAccepted) return { error: t("termsRequired") };

  const now = new Date();
  // Язык интерфейса гостя (кука → браузер) — фиксируем в Player и используем для письма.
  const locale = await getUserLocale();
  // На случай гонки/двойной отправки: если аккаунт с этим email уже появился — не
  // создаём второй (email @unique бросил бы), а просто входим в существующий.
  const existing = await prisma.player.findUnique({ where: { email }, select: { id: true } });
  let playerId: string;
  if (existing) {
    playerId = existing.id;
    // Аккаунт уже есть (гонка/двойная отправка) — по сути это вход по ссылке.
    await recordAuthEvent("LOGIN_MAGIC", playerId);
  } else {
    // sessionsValidFrom ставим явно из JS-времени — та же причина, что в registerAction
    // (округление TIMESTAMP(3) в БД могло бы сделать метку больше iat свежей сессии).
    const player = await prisma.player.create({
      data: { email, nickname, locale, termsAcceptedAt: now, sessionsValidFrom: now },
    });
    playerId = player.id;
    await recordAuthEvent("REGISTER", playerId);
    await safeSendEmail(buildWelcomeEmail(email, locale));
  }

  await clearPendingRegistration();
  await createSession(playerId);
  redirect("/analyze");
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
  // На /enter — вход по ссылке первичен (add1146); пароль доступен ссылкой с формы.
  redirect("/enter");
}

// Запрос закрытия аккаунта: шлём на почту ссылку подтверждения. Само закрытие — по
// кнопке на странице (confirmAccountCloseAction), НЕ по клику: иначе почтовый сканер
// мог бы закрыть аккаунт. Работает одинаково для парольных и беспарольных аккаунтов
// (владение ящиком = подтверждение). Требует сессии — закрывает СВОЙ аккаунт залогиненный.
export async function requestAccountClosureAction(
  _prevState: AuthFormState,
  _formData: FormData
): Promise<AuthFormState> {
  const t = await getTranslations("Errors");
  const session = await requireSession();
  const player = await prisma.player.findFirst({
    where: { id: session.playerId, closedAt: null },
    select: { id: true, email: true },
  });
  if (!player?.email) return { error: t("closureLinkSendFailed") };

  // Гасим прежние неиспользованные ссылки — действительна только свежая.
  await prisma.accountClosureToken.updateMany({
    where: { playerId: player.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  const { raw, hash } = generateClosureToken();
  await prisma.accountClosureToken.create({
    data: { playerId: player.id, tokenHash: hash, expiresAt: new Date(Date.now() + getAccountClosureTtlMs()) },
  });
  await safeSendEmail(buildClosureEmail(player.email, buildClosureLink(raw), await getUserLocale()));

  return { success: true };
}

// Подтверждение закрытия по ссылке (кнопка на странице → POST). Сессия НЕ требуется:
// клик может прийти с другого устройства, владение ящиком — само подтверждение.
// Закрытие мягкое (запрет 5): closedAt + анонимизация (email/passwordHash/nickname →
// NULL), турниры остаются (Tournament.player onDelete: Restrict). После закрытия
// closedAt != null гасит все сессии везде (проверка в requireSession/getCurrentPlayer).
export async function confirmAccountCloseAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const t = await getTranslations("Errors");
  const token = String(formData.get("token") ?? "");
  const INVALID = t("closureLinkInvalid");
  if (!token) return { error: INVALID };

  const row = await prisma.accountClosureToken.findUnique({
    where: { tokenHash: hashClosureToken(token) },
    select: { playerId: true, usedAt: true, expiresAt: true },
  });
  if (!row || row.usedAt || row.expiresAt < new Date()) return { error: INVALID };

  // Аккаунт мог быть уже закрыт (повтор) — тогда ссылка недействительна.
  const player = await prisma.player.findFirst({
    where: { id: row.playerId, closedAt: null },
    select: { id: true },
  });
  if (!player) return { error: INVALID };

  const now = new Date();
  await prisma.$transaction([
    prisma.player.update({
      where: { id: player.id },
      data: { closedAt: now, email: null, passwordHash: null, nickname: null },
    }),
    prisma.accountClosureToken.updateMany({
      where: { playerId: player.id, usedAt: null },
      data: { usedAt: now },
    }),
  ]);

  // Чистим cookie текущего устройства (на остальных сессия мертва по closedAt).
  await destroySession();
  redirect("/");
}
