import { NextResponse } from "next/server";
import { getDialogue } from "@/features/dialogue/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handId: string }> },
): Promise<NextResponse> {
  const { handId } = await params;
  const dialogue = await getDialogue(handId);
  if (!dialogue) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(dialogue);
}
