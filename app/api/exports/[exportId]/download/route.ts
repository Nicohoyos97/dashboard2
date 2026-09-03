// Download of an export Nick generated (spec §10 create_financial_export).
// The RLS-scoped client decides who may see the row (the requesting member,
// or a firm user at aal2); the file is served through a signed URL that
// expires in 60 s. Every download is audited and rate limited. Not localized.
import { NextResponse } from 'next/server';

import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { RATE_LIMITS, consumeRateLimit } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, ctx: { params: Promise<{ exportId: string }> }) {
  const { exportId } = await ctx.params;
  if (!UUID.test(exportId)) return new NextResponse(null, { status: 404 });

  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  if (!(await consumeRateLimit(`download:${user.id}`, RATE_LIMITS.download))) {
    return new NextResponse(null, { status: 429 });
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from('generated_exports')
    .select('id, storage_path, business_entity_id, expires_at')
    .eq('id', exportId)
    .eq('status', 'ready')
    .maybeSingle();
  if (!row || !row.storage_path) return new NextResponse(null, { status: 404 });
  if (row.expires_at && Date.parse(row.expires_at) < Date.now()) return new NextResponse(null, { status: 410 });

  const filename = row.storage_path.split('/').pop() ?? 'export.csv';
  const { data: signed, error } = await supabase.storage.from('exports').createSignedUrl(row.storage_path, 60, { download: filename });
  if (error || !signed) return new NextResponse(null, { status: 404 });

  await logAccess({ action: 'export.download', resourceType: 'generated_export', resourceId: row.id, businessEntityId: row.business_entity_id });

  return NextResponse.redirect(signed.signedUrl, { status: 302, headers: { 'Cache-Control': 'no-store' } });
}
