"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";
import { submitIntroSurveyAction, dismissIntroSurveyAction, type IntroSurveyState } from "./actions";

const initialState: IntroSurveyState = {};

// Пять квадратов 1-5 на общем `name` — родная HTML-валидация required у radio-группы
// не даёт отправить форму, пока не отмечена хотя бы одна кнопка в каждой группе.
function RatingGroup({ name, low, high }: { name: string; low: string; high: string }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-2">
      <span className="shrink-0 text-small text-muted-foreground">{low}</span>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className="flex size-9 cursor-pointer items-center justify-center border border-border bg-card font-mono text-small text-foreground transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground hover:border-primary"
          >
            <input type="radio" name={name} value={n} required className="sr-only" />
            {n}
          </label>
        ))}
      </div>
      <span className="shrink-0 text-small text-muted-foreground">{high}</span>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("IntroSurvey");
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? (
        <>
          {t("sending")}
          <LoadingDots />
        </>
      ) : (
        t("submit")
      )}
    </Button>
  );
}

// «Мы только в начале пути» — карточка под подписью турнира (правка Артёма 2026-07-29:
// не автопоп-ап, а приглашение с кнопкой — так и без конфликта с авто-открытием диалога
// «Ориентир» на том же первом турнире). Стиль карточки — как у StartHereCard/
// SessionDoneCard (components/tournament/focus-slot.tsx), они сидят в том же месте
// страницы. Сама 10-вопросная анкета открывается кнопкой «Пройти опрос», как обычный
// Dialog, без повтора вступительного текста — сразу вопросы. Показ фиксирует сервер
// (Player.introSurveyShownAt) один раз — либо при отправке, либо когда открытый опрос
// закрыли не ответив; саму карточку (кнопку не нажали) сервер не помечает — она
// остаётся точкой входа, пока страница считается «первым турниром» (см. gate в
// page.tsx). План 2026-07-29-опрос-после-первого-турнира.md.
export function IntroSurveyLine({ tournamentId }: { tournamentId: string }) {
  const t = useTranslations("IntroSurvey");
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [, startDismiss] = useTransition();
  const [state, formAction] = useActionState(submitIntroSurveyAction, initialState);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // Диалог реально открывали и закрыли — это и есть «показали». Отправили успешно
      // или просто закрыли крестиком/фоном/Escape — карточка больше не нужна.
      if (!state.success) {
        startDismiss(() => {
          void dismissIntroSurveyAction();
        });
      }
      setHidden(true);
    }
  }

  if (hidden) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <div className="mt-8 border border-primary bg-card p-6">
        <p className="font-mono text-label uppercase tracking-label text-primary">
          {t("cardTitle")}
        </p>
        <p className="mt-2 text-body text-foreground">{t("bannerText")}</p>
        <DialogTrigger render={<Button className="mt-4">{t("takeSurveyButton")}</Button>} />
      </div>

      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-none sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-h3 text-foreground">
            {state.success ? t("thanksTitle") : t("title")}
          </DialogTitle>
          {state.success && (
            <DialogDescription className="text-small text-muted-foreground">
              {t("thanksBody")}
            </DialogDescription>
          )}
        </DialogHeader>

        {!state.success && (
          <form action={formAction} className="space-y-6">
            <input type="hidden" name="tournamentId" value={tournamentId} />

            <div>
              <p className="text-body text-foreground">{t("usefulnessLabel")}</p>
              <RatingGroup name="usefulnessRating" low={t("ratingLow")} high={t("ratingHigh")} />
            </div>

            <div className="space-y-2">
              <p className="text-body text-foreground">{t("unclearLabel")}</p>
              <Textarea name="unclearText" rows={2} placeholder={t("unclearPlaceholder")} />
            </div>

            <div>
              <p className="text-body text-foreground">{t("toneLabel")}</p>
              <RatingGroup name="toneRating" low={t("ratingLow")} high={t("ratingHigh")} />
            </div>

            <div className="space-y-2">
              <p className="text-body text-foreground">{t("styleChangeLabel")}</p>
              <Textarea name="styleChangeText" rows={2} placeholder={t("styleChangePlaceholder")} />
            </div>

            <div>
              <p className="text-body text-foreground">{t("questionsLabel")}</p>
              <RatingGroup name="questionsRating" low={t("ratingLow")} high={t("ratingHigh")} />
            </div>

            <div className="space-y-2">
              <p className="text-body text-foreground">{t("moreDetailLabel")}</p>
              <Textarea name="moreDetailText" rows={2} placeholder={t("moreDetailPlaceholder")} />
            </div>

            <div className="space-y-2">
              <p className="text-body text-foreground">{t("likedLabel")}</p>
              <Textarea name="likedText" rows={2} placeholder={t("likedPlaceholder")} />
            </div>

            <div className="space-y-2">
              <p className="text-body text-foreground">{t("missingLabel")}</p>
              <Textarea name="missingText" rows={2} placeholder={t("missingPlaceholder")} />
            </div>

            <div>
              <p className="text-body text-foreground">{t("recommendLabel")}</p>
              <RatingGroup name="recommendRating" low={t("ratingLow")} high={t("ratingHigh")} />
            </div>

            <div className="space-y-2">
              <p className="text-body text-foreground">{t("freeformLabel")}</p>
              <Textarea name="freeformText" rows={3} placeholder={t("freeformPlaceholder")} />
            </div>

            {state.error && <p className="text-small text-destructive">{state.error}</p>}

            <SubmitButton />
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
