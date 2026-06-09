# План реализации вертикального среза

> **Статус:** утверждён 2026-06-09. Реализация заблокирована Запретом 6 до GO (≥3 оплат от незнакомцев).
> **Вариант seed-игрока:** А (фиксированный UUID анонимного игрока в конфиге, схема БД не меняется).

---

## Пре-условие и блокер

До первой строки кода — убедиться, что `parser/ggpoker/` покрыт тестами на детерминированность.
Запрет 4 прямо блокирует деплой без них. Если тестов нет — это первый шаг, до миграции.

---

## Порядок шагов

```
[A] Тест парсера                ← блокер по Запрету 4, пишем ПЕРВЫМ
[B] Next.js проект              ← scaffold trener/ с Prisma, TypeScript, App Router
[C] Миграция базы               ← только players + tournaments
[D] Seed                        ← анонимный демо-игрок (Вариант А)
[E] Domain + Infrastructure     ← типы, порт, репозиторий, Prisma-клиент, container
[F] Feature: upload             ← server action + форма
[G] Feature: card               ← query + компонент
[H] App routes                  ← две страницы
```

Нет в срезе: очередь, воркеры, S3, авторизация, LLM.
Парсинг синхронный — в одном HTTP-запросе. Файл живёт только в памяти, в БД идут только три числа.

---

## Файлы по модулям

### Тесты парсера (пишутся первыми)
- `trener/parser/ggpoker/__tests__/parser.test.ts`

### Prisma
- `trener/prisma/schema.prisma` — enums + таблицы `players` и `tournaments`
- `trener/prisma/migrations/YYYYMMDD_init_slice/migration.sql`
- `trener/prisma/seed.ts` — создаёт анонимного демо-игрока с UUID из конфига

### Domain
- `trener/domain/shared/types.ts` — `TournamentStatus` enum
- `trener/domain/shared/ports/tournament.port.ts` — `TournamentRepositoryPort`
- `trener/domain/shared/index.ts`
- `trener/domain/tournament/tournament.ts` — `Tournament` entity
- `trener/domain/tournament/ports.ts` — реэкспорт порта
- `trener/domain/tournament/index.ts`

### Infrastructure
- `trener/infrastructure/db/client.ts` — Prisma singleton
- `trener/infrastructure/db/index.ts`
- `trener/infrastructure/repositories/tournament.repository.ts`
- `trener/infrastructure/repositories/index.ts`
- `trener/infrastructure/container.ts` — wire TournamentRepository → порт

### Config
- `trener/config/index.ts` — `ANONYMOUS_PLAYER_ID` (UUID демо-игрока, не хардкодится в логике)

### Feature: upload
- `trener/features/tournaments/actions.ts` — `uploadTournament(formData)`:
  читает файл → `parseTournament` → `repo.create(...)` → `redirect('/tournaments/[id]')`
  или возвращает `{ error: 'Загрузи MTT-турнир GGPoker' }`
- `trener/features/tournaments/components/UploadForm.tsx`
- `trener/features/tournaments/index.ts`

### Feature: card
- `trener/features/card/queries.ts` — `getTournamentCard(id)`
- `trener/features/card/components/TournamentCard.tsx` — три числа, без стилей
- `trener/features/card/index.ts`

### App routes
- `trener/app/(dashboard)/tournaments/page.tsx` — рендерит `UploadForm`
- `trener/app/(dashboard)/tournaments/[id]/page.tsx` — рендерит `TournamentCard`

---

## Приёмочный тест — пишем первым

До любой миграции и domain-кода.

**Главный путь:**
> Когда `parseTournament(buffer)` вызван с валидным HH-файлом MTT-турнира GGPoker —
> возвращает `{ vpip, handsCount, resultBuyins }`, все три значения совпадают
> с ручным подсчётом по тому же файлу.

**Ошибка формата:**
> Когда `parseTournament(buffer)` вызван с файлом кэш-игры или файлом PokerStars —
> выбрасывает `UnsupportedFileError`.

---

## Риски

| # | Риск | Уровень | Как закрываем |
|---|---|---|---|
| 1 | **player_id NOT NULL** — схема требует FK, срез без авторизации | Решён | Вариант А: seed-игрок, UUID в `config/` |
| 2 | **played_at NOT NULL** — парсер должен возвращать дату турнира | Проверить | Если парсер не даёт дату — дефолт `NOW()` в action |
| 3 | **Детерминированность парсера** — Запрет 4 блокирует деплой без тестов | Блокер | Тест пишем первым |
| 4 | **ПДн в HH-файле** — никнеймы в буфере | Закрыт архитектурой | Файл не сохраняется, в БД только числа. Проверить что Next.js не пишет tmp на диск |
| 5 | **Идемпотентность загрузки** — хеш файла из чертежа 04 | Осознанно пропущено | Добавляется поверх среза, не сейчас |

---

## Статус задач

- [ ] Тест парсера (главный путь + ошибка формата)
- [ ] Next.js scaffold + Prisma setup
- [ ] Миграция: players + tournaments
- [ ] Seed: анонимный демо-игрок
- [ ] domain/shared: типы + порт
- [ ] domain/tournament: entity
- [ ] infrastructure/db: Prisma client
- [ ] infrastructure/repositories: tournament
- [ ] infrastructure/container
- [ ] config: ANONYMOUS_PLAYER_ID
- [ ] features/tournaments: action + форма
- [ ] features/card: query + компонент
- [ ] app routes: /tournaments и /tournaments/[id]
- [ ] Приёмочная проверка по сценариям среза
