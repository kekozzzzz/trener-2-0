import { NextResponse } from "next/server";
import { getDialogue } from "@/features/dialogue/queries";
import { isDialogueStepFailed } from "@/features/queue-recovery/queries";
import { authorizeHand } from "@/features/auth/ownership";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handId: string }> },
): Promise<NextResponse> {
  const { handId } = await params;

  // Проверка прав до чтения диалога: чужой разбор не отдаём (architecture/07-безопасность.md,
  // раздел 2). Тот же 404, что и при отсутствии раздачи, — без утечки факта существования.
  if (!(await authorizeHand(handId))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const dialogue = await getDialogue(handId);
  if (!dialogue) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // failed=true, если следующий шаг диалога сдох в карантин (иначе клиент крутил бы «готовим…»
  // вечно). Считаем только в состоянии ожидания — лишний запрос на каждый опрос не нужен.
  const failed = dialogue.state === "ANSWER_RECEIVED" ? await isDialogueStepFailed(handId) : false;
  return NextResponse.json({ ...dialogue, failed });
}
