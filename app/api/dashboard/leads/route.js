import { NextResponse } from "next/server";
import { requireOwner } from "../../../../lib/cloud-auth";
import { collectionWindowDays } from "../../../../lib/collection-window";
import { db, ensureSchema } from "../../../../lib/db";
import { dismissalFingerprint } from "../../../../lib/collector";

export const runtime = "nodejs";

export async function DELETE() {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "未授權" }, { status: 401 });
  await ensureSchema();
  const sql = db();
  const settingRows = await sql`SELECT collection_days FROM collector_settings WHERE threads_user_id=${owner.userId} LIMIT 1`;
  const collectionDays = collectionWindowDays(settingRows[0]?.collection_days);
  const rows = await sql`SELECT threads_id FROM leads WHERE threads_user_id=${owner.userId}`;
  const fingerprints = rows.map(row => ({ fingerprint: dismissalFingerprint(owner.userId, row.threads_id) }));
  if (fingerprints.length) {
    await sql`
      INSERT INTO dismissed_items (threads_user_id, fingerprint, expires_at)
      SELECT ${owner.userId}, x.fingerprint, NOW() + (${collectionDays} * INTERVAL '1 day')
      FROM jsonb_to_recordset(${JSON.stringify(fingerprints)}::jsonb) AS x(fingerprint text)
      ON CONFLICT (threads_user_id, fingerprint) DO UPDATE SET expires_at=EXCLUDED.expires_at`;
  }
  const deleted = await sql`DELETE FROM leads WHERE threads_user_id=${owner.userId} RETURNING id`;
  return NextResponse.json({ deleted: deleted.length });
}
