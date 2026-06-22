import { NextRequest, NextResponse } from "next/server";
import { getPaymentsAdapter } from "@/infrastructure/adapters/payments";
import { getYooKassaWebhookIps } from "@/config/payments";
import { applySucceededPayment } from "@/features/subscription/apply-payment";
import { ipv4InAnyRange } from "@/lib/net";

// Вебхук ЮKassa: уведомление о смене статуса платежа.
//
// Главный принцип безопасности — НЕ доверяем телу уведомления. Из тела берём только
// id платежа, а реальный статус перечитываем из API ЮKassa по нашему секретному
// ключу (getPayment). Поэтому подделать активацию подписки фальшивым телом нельзя:
// мы активируем только то, что подтвердил сам ЮKassa. Идемпотентность — в
// applySucceededPayment (уникальный external_payment_id).
//
// IP-аллоулист — необязательный второй слой (env YOOKASSA_WEBHOOK_IPS). За реверс-
// релеем реальный адрес отправителя может теряться, поэтому по умолчанию выключен,
// а основной гарантией остаётся перечитывание платежа.

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Необязательная проверка IP-источника.
  const allowedIps = getYooKassaWebhookIps();
  if (allowedIps.length > 0) {
    const ip = clientIp(req);
    if (!ip || !ipv4InAnyRange(ip, allowedIps)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  // 2. Достаём id платежа из тела (только id, статусу из тела не верим).
  let paymentId: string | undefined;
  try {
    const body = (await req.json()) as { object?: { id?: string } };
    paymentId = body.object?.id;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  // Тело вебхука может прислать кто угодно: id уйдёт в URL запроса к ЮKassa, поэтому
  // принимаем только безопасный набор символов id платежа (буквы/цифры/дефис/подчёрк) —
  // без слэшей, точек и %, чтобы исключить инъекцию пути/SSRF. Важен именно набор
  // символов, а не длина. Чужое — игнорируем (200, чтобы не провоцировать повторы на
  // мусорных уведомлениях).
  if (!paymentId || !/^[A-Za-z0-9_-]{1,64}$/.test(paymentId)) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // 3. Перечитываем платёж из API и применяем, если он реально оплачен.
  try {
    const payment = await getPaymentsAdapter().getPayment(paymentId);
    await applySucceededPayment(payment); // сам отфильтрует не-succeeded
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    // Ошибка БД/сети/некорректные metadata → 500: ЮKassa повторит доставку позже,
    // а мы увидим причину в логах. Платёж не потеряется.
    console.error("yookassa webhook: ошибка обработки", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
