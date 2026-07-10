"use client";

import { CircleHelp } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Глоссарий метрик, покерных терминов и наших обозначений, которые игрок видит в
// интерфейсе и в разборах. Объясняем простым языком через смысл и последствие (как и
// промпты коуча: термины не вываливаем без расшифровки). Сгруппировано, чтобы не была
// простыня. Это справочная копия, не бизнес-конфиг — живёт рядом с компонентом.
type Term = { short: string; full?: string; desc: string };
type Group = { title: string; terms: Term[] };

function useGlossaryGroups(): Group[] {
  const t = useTranslations("Glossary");
  return [
    {
      title: t("groupMetrics"),
      terms: [
        { short: "VPIP", full: t("vpipFull"), desc: t("vpipDesc") },
        { short: "PFR", full: t("pfrFull"), desc: t("pfrDesc") },
        { short: "RFI", full: t("rfiFull"), desc: t("rfiDesc") },
        { short: "SPR", full: t("sprFull"), desc: t("sprDesc") },
        { short: "BB", full: t("bbFull"), desc: t("bbDesc") },
        { short: "AF", full: t("afFull"), desc: t("afDesc") },
        { short: t("potOddsShort"), full: t("potOddsFull"), desc: t("potOddsDesc") },
        { short: t("impliedShort"), full: t("impliedFull"), desc: t("impliedDesc") },
        { short: t("equityShort"), desc: t("equityDesc") },
        { short: t("foldEquityShort"), desc: t("foldEquityDesc") },
      ],
    },
    {
      title: t("groupActions"),
      terms: [
        { short: t("threeBetShort"), desc: t("threeBetDesc") },
        { short: t("limpShort"), desc: t("limpDesc") },
        { short: t("isoShort"), desc: t("isoDesc") },
        { short: t("restealShort"), desc: t("restealDesc") },
        { short: t("donkShort"), desc: t("donkDesc") },
        { short: t("checkRaiseShort"), desc: t("checkRaiseDesc") },
        { short: t("allinShort"), desc: t("allinDesc") },
        { short: t("pushFoldShort"), desc: t("pushFoldDesc") },
      ],
    },
    {
      title: t("groupHands"),
      terms: [
        { short: t("drawShort"), desc: t("drawDesc") },
        { short: t("topPairShort"), desc: t("topPairDesc") },
        { short: t("blockersShort"), desc: t("blockersDesc") },
        { short: t("polarShort"), desc: t("polarDesc") },
        { short: t("wetBoardShort"), desc: t("wetBoardDesc") },
        { short: t("coolerShort"), desc: t("coolerDesc") },
      ],
    },
    {
      title: t("groupTournament"),
      terms: [
        { short: t("icmShort"), full: t("icmFull"), desc: t("icmDesc") },
        { short: t("bountyShort"), desc: t("bountyDesc") },
      ],
    },
    {
      title: t("groupProduct"),
      terms: [
        { short: t("criticalShort"), desc: t("criticalDesc") },
        { short: t("matchShort"), desc: t("matchDesc") },
        { short: t("passedShort"), desc: t("passedDesc") },
        { short: t("orientirShort"), desc: t("orientirDesc") },
        { short: t("chartsShort"), desc: t("chartsDesc") },
        { short: t("startHereShort"), desc: t("startHereDesc") },
      ],
    },
  ];
}

// Тело диалога — общее для встроенной иконки и плавающей кнопки: только триггер разный.
function GlossaryBody() {
  const t = useTranslations("Glossary");
  const groups = useGlossaryGroups();
  return (
    <DialogContent className="rounded-none sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="font-mono text-label uppercase tracking-label text-muted-foreground">
          {t("title")}
        </DialogTitle>
        <DialogDescription className="sr-only">{t("srDescription")}</DialogDescription>
      </DialogHeader>
      <div className="-mr-2 max-h-[70vh] space-y-8 overflow-y-auto pr-2">
        {groups.map((group) => (
          <section key={group.title} className="space-y-3">
            <h3 className="font-mono text-label uppercase tracking-label text-primary">{group.title}</h3>
            <dl className="space-y-4">
              {group.terms.map((term) => (
                <div key={term.short}>
                  <dt className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-body text-foreground">{term.short}</span>
                    {term.full && <span className="text-small text-muted-foreground">{term.full}</span>}
                  </dt>
                  <dd className="mt-1 text-small text-muted-foreground">{term.desc}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </DialogContent>
  );
}

// Плавающая кнопка «?» — закреплена наверху справа (под шапкой, чтобы не налезать на
// меню) и едет с игроком по странице: на любом месте открывает словарь. Единственный
// «?» на странице. Ставится туда, где игрок сталкивается с терминами (турнир, разбор).
export function FloatingGlossary() {
  const t = useTranslations("Glossary");
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="secondary"
            size="icon"
            aria-label={t("helpLabel")}
            className="fixed right-6 top-20 z-40 bg-card"
          />
        }
      >
        <CircleHelp />
      </DialogTrigger>
      <GlossaryBody />
    </Dialog>
  );
}
