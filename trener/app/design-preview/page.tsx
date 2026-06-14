import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, Trash2 } from "lucide-react";

const palette = [
  { name: "background", hex: "#0E0E0E", role: "Фон страницы" },
  { name: "card / surface", hex: "#1A1A1A", role: "Карточки, поля, модалки" },
  { name: "border", hex: "#2A2A2A", role: "Границы, разделители" },
  { name: "foreground", hex: "#F5F5F5", role: "Основной текст" },
  { name: "muted-foreground", hex: "#8C8C8C", role: "Лейблы, второстепенный текст" },
  { name: "primary / accent", hex: "#D4FF33", role: "CTA, активные состояния, ключевые числа" },
  { name: "destructive", hex: "#FF5C5C", role: "Только текст/рамка ошибки формы" },
];

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) {
  return (
    <Label
      htmlFor={htmlFor}
      className="font-mono text-label uppercase tracking-label text-muted-foreground"
    >
      {children}
    </Label>
  );
}

export default function DesignPreviewPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-16 px-8 py-16">
      <header className="space-y-3">
        <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
          Design Preview
        </p>
        <h1 className="text-display">Тренер 2.0</h1>
        <p className="max-w-2xl text-body text-muted-foreground">
          Витрина компонентов shadcn/ui на токенах из{" "}
          <span className="font-mono text-small">design/design-system.md</span>. Сверяем стиль
          здесь. Наведи, кликни и протаби интерактивные элементы — hover/active/focus реальные.
        </p>
      </header>

      {/* Палитра */}
      <section className="space-y-4">
        <h2 className="text-h2">Палитра</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {palette.map((c) => (
            <div key={c.name} className="space-y-2">
              <div className="h-16 border border-border" style={{ background: c.hex }} />
              <div className="text-small">{c.name}</div>
              <div className="font-mono text-label uppercase text-muted-foreground">{c.hex}</div>
              <div className="text-small text-muted-foreground">{c.role}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Типографика */}
      <section className="space-y-4">
        <h2 className="text-h2">Типографика</h2>
        <div className="space-y-4">
          <p className="text-display">Аа Бб 64 — Display</p>
          <h1 className="text-h1">Заголовок страницы — H1 40</h1>
          <h2 className="text-h2">Заголовок секции — H2 28</h2>
          <h3 className="font-sans text-h3">Подзаголовок карточки — H3 20</h3>
          <p className="text-body">
            Основной текст диалога. VPIP <span className="font-mono">24.5%</span>, потеря{" "}
            <span className="font-mono">-12.0 BB</span> в раздаче — body 16.
          </p>
          <p className="text-small text-muted-foreground">Вторичный текст — small 14.</p>
          <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
            Лейбл поля — label 12
          </p>
        </div>
      </section>

      {/* Кнопки */}
      <section className="space-y-4">
        <h2 className="text-h2">Кнопки</h2>
        <div className="flex flex-wrap items-center gap-4">
          <Button>Загрузить турнир</Button>
          <Button variant="outline">Отмена</Button>
          <Button variant="ghost">Без обводки</Button>
          <Button disabled>Недоступно</Button>
        </div>
      </section>

      {/* Поле формы */}
      <section className="space-y-4">
        <h2 className="text-h2">Поле формы</h2>
        <div className="grid max-w-md gap-6">
          <div className="grid gap-2">
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" placeholder="you@example.com" />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="nick">Никнейм</FieldLabel>
            <Input id="nick" defaultValue="Hero" />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="broken">С ошибкой</FieldLabel>
            <Input id="broken" aria-invalid defaultValue="не число" />
            <p className="text-small text-destructive">Ожидалось число</p>
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="ro">Недоступно</FieldLabel>
            <Input id="ro" disabled defaultValue="Заблокировано" />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="focus">В фокусе</FieldLabel>
            <Input
              id="focus"
              defaultValue="Активное поле"
              className="border-ring ring-3 ring-ring/50"
            />
          </div>
        </div>
      </section>

      {/* Карточка */}
      <section className="space-y-4">
        <h2 className="text-h2">Карточка</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Турнир #4821</CardTitle>
              <CardDescription>$1.10 NLH, 1024 игрока</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-display text-primary">+3.2</p>
              <p className="text-small text-muted-foreground">BB за турнир</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer transition-colors hover:border-primary">
            <CardHeader>
              <CardTitle>Кликабельная карточка</CardTitle>
              <CardDescription>Наведи — рамка становится акцентной</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-body">Переход к разбору раздачи →</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Таблица */}
      <section className="space-y-4">
        <h2 className="text-h2">Таблица</h2>
        <Table>
          <TableCaption>Раздачи турнира #4821</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Раздача</TableHead>
              <TableHead>Улица</TableHead>
              <TableHead>Важность</TableHead>
              <TableHead className="text-right">Результат, BB</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-mono">#142</TableCell>
              <TableCell>Ривер</TableCell>
              <TableCell>CRITICAL</TableCell>
              <TableCell className="text-right font-mono text-destructive">-18.0</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-mono">#118</TableCell>
              <TableCell>Флоп</TableCell>
              <TableCell>STRONG</TableCell>
              <TableCell className="text-right font-mono">+6.5</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-mono">#097</TableCell>
              <TableCell>Префлоп</TableCell>
              <TableCell>MEDIUM</TableCell>
              <TableCell className="text-right font-mono text-primary">+2.0</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>

      {/* Диалог */}
      <section className="space-y-4">
        <h2 className="text-h2">Диалог</h2>
        <Dialog>
          <DialogTrigger render={<Button variant="outline">Открыть диалог</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Почему именно колл?</DialogTitle>
              <DialogDescription>
                Сократовский вопрос перед оценкой — стадия question диалога.
              </DialogDescription>
            </DialogHeader>
            <p className="text-body">
              На ривере банк 1200, ставка villain 600. Какие пот-оддсы у героя?
            </p>
            <DialogFooter>
              <DialogClose render={<Button variant="outline">Закрыть</Button>} />
              <Button>Ответить</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>

      {/* Выпадающее меню */}
      <section className="space-y-4">
        <h2 className="text-h2">Выпадающее меню</h2>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline">
                Турнир #4821 <ChevronDown />
              </Button>
            }
          />
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Действия</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Открыть карточку</DropdownMenuItem>
              <DropdownMenuItem>Экспорт HH</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Trash2 /> Удалить турнир
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </section>
    </main>
  );
}
