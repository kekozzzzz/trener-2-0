---
name: project_magic_link_auth
description: "вход и регистрация по «волшебной ссылке» (passwordless) — ЗАДЕПЛОЕНО 2026-06-28, миграции применены"
metadata: 
  node_type: memory
  type: project
  originSessionId: abcd9049-35cd-408c-8cf4-d3f7f643ff79
---

Passwordless вход + регистрация по одноразовой ссылке из письма (выбран вместо соцвходов VK/Google/Apple — приватность покер-аудитории + связность из РФ через релей). Ввёл email → ссылка (15 мин, одноразовая) → клик в GET-роуте `/enter/verify`: игрок есть → сессия; нет → подписанная cookie «намерения» несёт email на `/enter/complete` (согласие + ник) → аккаунт без пароля (`passwordHash` NULL) + сессия. Пароль остаётся запасным способом.

Новая таблица `MagicLinkToken` (ключ — email, SHA-256 токена). Миграция `20260628120000_add_magic_link_tokens` — на dev+test вручную (db execute), **на прод применена при деплое 2026-06-28**.

Доработка под беспарольные аккаунты (сделана): «Сменить пароль» → «Задать пароль» для них (`setPasswordAction`, без текущего; флаг `getCurrentPlayer.hasPassword`). Закрытие аккаунта переведено на ссылку из письма для ВСЕХ (`requestAccountClosureAction` под сессией → страница `/account/close/confirm` с кнопкой → `confirmAccountCloseAction`, POST не по клику — против почтовых сканеров); новая таблица `AccountClosureToken` (миграция `20260628140000`); старый `closeAccountAction` по паролю убран; закрытие осталось мягким (запрет 5).

Статус: **ЗАДЕПЛОЕНО 2026-06-28** (коммит ad0d50d, см. [[project_pricing_model]] Big batch deploy). Тесты 387 зелёных (auth 62), tsc+build зелёные. ОБЕ миграции (`20260628120000_add_magic_link_tokens`, `20260628140000_add_account_closure_tokens`) применены на прод при деплое.

Хвост (не блокер): следить за «сжиганием» токена входа почтовыми сканерами (для личных почт риск низкий). План: plans/2026-06-28-вход-по-волшебной-ссылке.md. Связано с [[project_email_and_reset]], [[feedback_hardening_before_deploy]].

ДОРАБОТКА 2026-07-02 (решение Артёма): /enter стал ПЕРВИЧНЫМ входом — все двери гостя
(шапка AuthNav «Войти»+«Регистрация», оба CTA лендинга, CTA тарифов, redirect
requireSession) ведут на /enter; пароль/классическая регистрация остаются по ссылкам
с форм (/enter→/login→/register). +LangSwitcher в шапку /enter, +сабтайтл «эта же
ссылка создаст аккаунт» (RU/EN). ЗАДЕПЛОЕНО LIVE 2026-07-03 (715855b).
Хвост logoutEverywhereAction → /enter закрыт 103cff4 (2026-07-03, после мерджа
параллельной сессии). Полный сьют 571 зелёный, build зелёный.

🔴 ПРОД-БАГ найден 2026-07-02 (Артём кликнул ссылку из письма с whygrid.app): verify-роут
строил редиректы от req.url, а за nginx приложение видит себя как localhost:3000 →
Location уводил браузер пользователя на ЕГО localhost (у Артёма там ещё крутился dev с
HSTS-заголовком → ERR_SSL_PROTOCOL_ERROR; HSTS в dev тоже убран, next.config.ts).
Ссылка в письме при этом ПРАВИЛЬНАЯ (getAppBaseUrl → whygrid.app). ФИКС:
app/enter/verify/route.ts — редиректы от getAppBaseUrl(), не от req.url. ЗАКОММИЧЕНО
c56ed08 (+HSTS только в проде — dev-браузеру отравлял localhost). ХОТФИКС НАКАЧЕН НА
ПРОД 2026-07-02 (по «надо доделать» Артёма): точечная sed-правка route.ts прямо на ВМ
(файл целиком нельзя — локальная версия тянет recordAuthEvent из незадеплоенной
админки) + rebuild + pm2 restart; проверено: Location → https://whygrid.app/enter,
/health все ok. Хотфикс снят checkout-ом при деплое 715855b (2026-07-03) — дерево ВМ
снова чистое, c56ed08 приехал штатно.
Хвосты: (а) nginx на ВМ не пробрасывает Host/X-Forwarded-* — починить при случае;
(б) Unisender click-tracking оборачивает одноразовую ссылку (no-reply.whygrid.app/ru/
go2_link_tracker) — почтовые сканеры могут сжигать токен, рассмотреть отключение
трекинга для этого письма или POST-подтверждение как у закрытия аккаунта.
