import { CircleHelp, ChevronRight, ArrowRight } from "lucide-react";

// Подсказка «Как выгрузить руки» — вложенные раскрывашки на нативном <details>
// (без клиентского JS, доступно с клавиатуры, в стиле дизайн-системы). Верхний
// тумблер раскрывает список румов; клик по руму раскрывает его шаги. Пока ничего
// не нажато — инструкций не видно. Пока только текст, скриншоты добавим позже.
//
// Названия румов — по узнаваемому клиенту/скину, а не по сети: iPoker → Red Star
// Poker, Chico → BetOnline (игрок знает свой скин, а не имя сети). Сеть — в подписи.

type Room = {
  id: string;
  name: string;
  tag?: string;
  steps: string[];
  paths?: string[];
  ext: string;
  note?: string;
};

export const HAND_HISTORY_ROOMS: Room[] = [
  {
    id: "ggpoker",
    name: "GGPoker",
    steps: [
      "Открой клиент GGPoker и войди в аккаунт.",
      "Вверху окна найди иконку истории (значок со списком/часами) и нажми — откроется панель последних событий.",
      "Внизу этой панели нажми кнопку «PokerCraft…» — это встроенная в клиент аналитика.",
      "В окне PokerCraft в меню слева выбери раздел «Турнир» — покажется список сыгранных турниров.",
      "Вверху в фильтре «Дата» задай период (например «Последние 7 дней») и нажми красную кнопку «ПОКАЗАТЬ».",
      "Слева от турнира поставь галочку в квадратике (галочка у заголовка колонки выберет сразу все нужные).",
      "Нажми КРАСНУЮ кнопку «Установка — истории игр». Зелёная «Итоги игры» рядом — это только итоги, не сами руки, она не подойдёт.",
      "Скачается файл. Если это архив (.zip) — распакуй его, внутри лежат .txt-файлы. Их и загружай к нам.",
    ],
    ext: ".txt (иногда в .zip-архиве — распакуй)",
    note: "Кнопки «скачать всё разом» в GGPoker нет. Если играл в разных форматах (турниры, Spin & Gold), пройди по каждому разделу слева отдельно.",
  },
  {
    id: "pokerstars",
    name: "PokerStars",
    steps: [
      "Открой клиент PokerStars и войди в аккаунт.",
      "В верхнем меню открой «Настройки» (Settings).",
      "Слева выбери раздел «История игры» (Playing History) → «История рук» (Hand History).",
      "Поставь галочку «Сохранять мою историю рук» (Save My Hand History) — без неё файлы не пишутся.",
      "Тут же, в поле «Куда сохранять» (Where To Save), указана папка с файлами. Запомни её (или нажми «Изменить папку» — Change Folder — и выбери удобную).",
      "Открой эту папку на компьютере и забери нужные .txt-файлы турниров.",
    ],
    paths: ["Путь показан в «Where To Save» в тех же настройках"],
    ext: ".txt",
    note: "Хочешь видеть раздачу сразу за столом — включи «Instant Hand History» в меню стола («Стол» / «Table»). Язык истории не важен, мы читаем любой.",
  },
  {
    id: "winamax",
    name: "Winamax",
    steps: [
      "Открой клиент Winamax и войди в аккаунт.",
      "Открой «Настройки» (User Settings) — обычно шестерёнка или пункт меню с твоим ником.",
      "Перейди на вкладку «Game settings» → пункт «Hand History».",
      "Поставь галочку «Save My Hand History» — сохранять историю рук.",
      "Открой папку профиля (путь ниже) и забери .txt-файлы.",
    ],
    paths: [
      "Documents\\Winamax Poker\\accounts\\[твой ник]\\history",
      "новый клиент: AppData\\Roaming\\winamax\\documents\\accounts\\[твой ник]\\history",
    ],
    ext: ".txt",
    note: "Папку AppData Windows прячет — в проводнике включи «Показывать скрытые элементы» (вкладка «Вид»), иначе не найдёшь. Сменить папку истории Winamax не даёт — бери файлы из этой.",
  },
  {
    id: "888poker",
    name: "888poker",
    steps: [
      "Открой клиент 888poker (лобби) и войди в аккаунт.",
      "Открой «Settings» → «Game Settings» (игровые настройки).",
      "Поставь галочку «Keep my hand history in» — сохранять историю рук.",
      "Рядом указана папка (сменить — кнопка «Change Folder»). Запомни путь.",
      "Открой эту папку и забери .txt-файлы турниров.",
    ],
    paths: [
      "Documents\\888poker\\HandHistory",
      "иногда: AppData\\Roaming\\PacificPoker\\HandHistory",
    ],
    ext: ".txt",
  },
  {
    id: "acr",
    name: "ACR / PokerKing",
    tag: "сеть WPN (Winning Poker Network)",
    steps: [
      "Открой клиент (Americas Cardroom или PokerKing) и войди в аккаунт.",
      "Нажми шестерёнку настроек в правом верхнем углу → раздел «Hand Histories» в меню слева. Другой путь: «Game Info» вверху → «View Hand History» → кнопка «Options» внизу.",
      "Поставь галочку «Save Hand History» — сохранять историю рук.",
      "Посмотри поле «Destination folder» — там папка с файлами.",
      "Открой эту папку и забери .txt-файлы.",
    ],
    paths: ["по умолчанию: C:\\AmericasCardroom\\handHistory"],
    ext: ".txt",
  },
  {
    id: "ipoker",
    name: "Red Star Poker",
    tag: "сеть iPoker — также Betfair, Betsson и др.",
    steps: [
      "Открой клиент Red Star Poker (или другого iPoker-рума) и войди в аккаунт.",
      "В лобби открой «My Account» → «Settings» → раздел «General».",
      "Поставь галочку «Store Hand History Locally» — хранить историю на компьютере.",
      "Открой папку с файлами (путь ниже; название клиента в пути — это твой рум).",
      "Забери файлы раздач — это .xml или .txt.",
    ],
    paths: ["AppData\\Local\\[название клиента]\\data\\[твой ник]\\History\\Data"],
    ext: ".xml или .txt",
    note: "Клиент должен быть на английском — иначе история может не сохраниться как надо. Папку AppData Windows прячет — включи показ скрытых элементов.",
  },
  {
    id: "chico",
    name: "BetOnline",
    tag: "также TigerGaming, SportsBetting (сеть Chico)",
    steps: [
      "Открой клиент BetOnline (или TigerGaming / SportsBetting) и войди в аккаунт.",
      "В лобби внизу слева открой «Settings» → «More options».",
      "В разделе «History» включи «Save Hand History» и укажи папку, куда сохранять руки.",
      "Сыграй — файлы .txt лягут в эту папку. Открой её и забери нужные.",
    ],
    paths: ["папка, которую ты задал в настройках истории"],
    ext: ".txt",
    note: "Если какой-то файл не распознается — напиши нам, подправим.",
  },
];

// Одна раскрывашка рума: клик по названию раскрывает шаги (пока не нажали — скрыто).
function RoomDetails({ room }: { room: Room }) {
  return (
    <details className="group/room border-t border-border first:border-t-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-body font-medium text-foreground">{room.name}</span>
          {room.tag && (
            <span className="font-mono text-label uppercase tracking-label text-muted-foreground">
              {room.tag}
            </span>
          )}
        </span>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open/room:rotate-90"
          aria-hidden
        />
      </summary>

      <div className="px-6 pb-8 pt-2">
        <ol className="space-y-4">
          {room.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-4">
              <span className="flex size-6 shrink-0 items-center justify-center bg-primary font-mono text-label font-medium text-background">
                {i + 1}
              </span>
              <span className="text-body">{step}</span>
            </li>
          ))}
        </ol>

        {room.paths && (
          <div className="mt-6 flex items-start gap-2">
            <ArrowRight className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
            <div className="space-y-1">
              <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
                Папка с файлами
              </p>
              {room.paths.map((p, i) => (
                <p key={i} className="break-all font-mono text-small text-foreground">
                  {p}
                </p>
              ))}
            </div>
          </div>
        )}

        <p className="mt-6 font-mono text-label uppercase tracking-label text-muted-foreground">
          Загружаешь: <span className="text-primary">{room.ext}</span>
        </p>

        {room.note && (
          <p className="mt-4 border-l border-primary pl-4 text-small text-muted-foreground">
            {room.note}
          </p>
        )}
      </div>
    </details>
  );
}

// withToggle=true (по умолчанию, для инлайна на загрузке): верхний тумблер «Как
// выгрузить руки» скрывает весь список. withToggle=false (для отдельной страницы,
// где заголовок уже есть): сразу показываем список румов-раскрывашек.
export function HandHistoryGuide({ withToggle = true }: { withToggle?: boolean }) {
  const rooms = (
    <div>
      {HAND_HISTORY_ROOMS.map((room) => (
        <RoomDetails key={room.id} room={room} />
      ))}
    </div>
  );

  if (!withToggle) {
    return <div className="border border-border bg-card text-left">{rooms}</div>;
  }

  return (
    <details className="group/top border border-border bg-card text-left">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 font-mono text-label uppercase tracking-label text-muted-foreground transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <CircleHelp className="size-4" aria-hidden />
          Как выгрузить руки
        </span>
        <ChevronRight
          className="size-4 shrink-0 transition-transform group-open/top:rotate-90"
          aria-hidden
        />
      </summary>
      <div className="border-t border-border">{rooms}</div>
    </details>
  );
}
