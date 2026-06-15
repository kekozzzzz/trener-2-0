import { NextResponse } from "next/server";
import { getChat } from "@/features/chat/queries";
import { authorizeHand } from "@/features/auth/ownership";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handId: string }> },
): Promise<NextResponse> {
  const { handId } = await params;

  // Проверка прав до чтения треда: чужой чат не отдаём (architecture/07-безопасность.md,
  // раздел 2). Тот же 404, что и при отсутствии раздачи, — без утечки факта существования.
  if (!(await authorizeHand(handId))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const chat = await getChat(handId);
  if (!chat) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(chat);
}
