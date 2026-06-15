import { NextResponse } from "next/server";
import { getChat } from "@/features/chat/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handId: string }> },
): Promise<NextResponse> {
  const { handId } = await params;
  const chat = await getChat(handId);
  if (!chat) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(chat);
}
