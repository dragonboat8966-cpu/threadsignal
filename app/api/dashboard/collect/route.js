import { NextResponse } from "next/server";
import { requireOwner } from "../../../../lib/cloud-auth";
import { collectAccount } from "../../../../lib/collector";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "未授權" }, { status: 401 });
  try {
    return NextResponse.json(await collectAccount(owner.userId, { triggerType: "manual" }));
  } catch (error) {
    return NextResponse.json({ error: error.message || "蒐集失敗" }, { status: 500 });
  }
}
