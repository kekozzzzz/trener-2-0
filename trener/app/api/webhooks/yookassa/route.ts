import { NextRequest, NextResponse } from "next/server";
import { getPaymentsAdapter } from "@/infrastructure/adapters/payments";
import { getYooKassaWebhookIps } from "@/config/payments";
import { applySucceededPayment } from "@/features/subscription/apply-payment";
import { applyRefund } from "@/features/subscription/apply-refund";
import { ipv4InAnyRange } from "@/lib/net";

// Вебхук ЮKassa: уведомление о событии по платежу или возврату.
//
// ЮKassa шлёт сюда РАЗНЫЕ типы событий (поле event): payment.succeeded,
// refund.succeeded и др. object.id — это id объекта СВОЕГО типа: для payment.* —
// платёж, для refund.* — возврат. Раньше мы для любого события дёргали getPayment,
// и на возвратах ЮKassa отвечала 404 → мы возвращали 500 → она долбила повторами.
// Поэтому ветвимся по event и читаем нужный объект нужным методом.
//
// Главный принцип безопасности — НЕ доверяем телу уведомления. Из тела берём только
// id, а реальные данные перечитываем из API ЮKassa по нашему секретному ключу
// (getPayment/getRefund). Поэтому подделать активацию/снятие подписки фальшивым телом
// нельзя: меняем только то, что подтвердил сам ЮKassa. Идемпотентность — в
// applySucceededPayment/applyRefund (уникальный external_payment_id у проводки).
//
// IP-аллоулист — необязательный второй слой (env YOOKASSA_WEBHOOK_IPS). За реверс-
// релеем реальный адрес отправителя может теряться, поэтому по умолчанию выключен,
// а основной гарантией остаётся перечитывание платежа.

// x-real-ip первым: релей ставит его сам из $remote_addr, клиент не подделает.
// x-forwarded-for — только fallback, и ПОСЛЕДНИЙ элемент цепочки (релей
// $proxy_add_x_forwarded_for дописывает свой IP в конец, а не заменяет; первый
// элемент — то, что прислал сам клиент, и его можно подделать произвольно).
function clientIp(req: NextRequest): string | null {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1]!;
  }
  return null;
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

  // 2. Достаём тип события и id объекта из тела (только id, данным из тела не верим).
  let event: string | undefined;
  let objectId: string | undefined;
  try {
    const body = (await req.json()) as { event?: string; object?: { id?: string } };
    event = body.event;
    objectId = body.object?.id;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  // Тело вебхука может прислать кто угодно: id уйдёт в URL запроса к ЮKassa, поэтому
  // принимаем только безопасный набор символов (буквы/цифры/дефис/подчёрк) — без
  // слэшей, точек и %, чтобы исключить инъекцию пути/SSRF. Важен именно набор
  // символов, а не длина. Чужое — игнорируем (200, чтобы не провоцировать повторы на
  // мусорных уведомлениях).
  if (!objectId || !/^[A-Za-z0-9_-]{1,64}$/.test(objectId)) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // 3. Ветвимся по типу события и перечитываем соответствующий объект из API.
  //    Неизвестные/прочие события (refund.canceled, payout.* и т.п.) — тихо 200,
  //    чтобы ЮKassa не повторяла доставку того, что нам не нужно.
  try {
    if (event?.startsWith("payment.")) {
      const payment = await getPaymentsAdapter().getPayment(objectId);
      await applySucceededPayment(payment); // сам отфильтрует не-succeeded
    } else if (event === "refund.succeeded") {
      const refund = await getPaymentsAdapter().getRefund(objectId);
      await applyRefund(refund); // снимает доступ и пишет проводку возврата
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    // Ошибка БД/сети/некорректные данные → 500: ЮKassa повторит доставку позже,
    // а мы увидим причину в логах. Платёж/возврат не потеряется.
    console.error("yookassa webhook: ошибка обработки", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
