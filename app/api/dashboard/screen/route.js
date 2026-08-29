import { NextResponse } from "next/server";
import { requireOwner } from "../../../../lib/cloud-auth";
import { screenPendingLeads } from "../../../../lib/screener";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "未授權" }, { status: 401 });
  let input = {};
  try { input = await request.json(); }
  catch { /* An empty body uses the safe default. */ }
  try {
    return NextResponse.json(await screenPendingLeads(owner.userId, { limit: input.limit }));
  } catch (error) {
    return NextResponse.json({
      error: String(error.message || error || "AI 語意篩選失敗").slice(0, 500),
      screenedCount: 0,
      acceptedCount: 0,
      rejectedCount: 0
    }, { status: 503 });
  }
}
