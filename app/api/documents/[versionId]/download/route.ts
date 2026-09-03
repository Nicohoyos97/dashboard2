// Original-document download (INITIAL_PROMPT.md §3, §9). The RLS-scoped
// client decides who may see the version (member of the business + the
// document's current published version, or a firm user at aal2); the bytes
// are then served through a signed URL that expires in 60 s. Every download
// is audited and rate limited. Not localized.
import { NextResponse } from 'next/server';

import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { RATE_LIMITS, consumeRateLimit } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, ctx: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await ctx.params;
  if (!UUID.test(versionId)) return new NextResponse(null, { status: 404 });

  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  if (!(await consumeRateLimit(`download:${user.id}`, RATE_LIMITS.download))) {
    return new NextResponse(null, { status: 429 });
  }

  const supabase = await createClient();
  const { data: version } = await supabase
    .from('document_versions')
    .select('id, storage_path, original_filename, business_entity_id')
    .eq('id', versionId)
    .eq('upload_status', 'uploaded')
    .maybeSingle();
  if (!version) return new NextResponse(null, { status: 404 });

  const { data: signed, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(version.storage_path, 60, { download: version.original_filename });
  if (error || !signed) return new NextResponse(null, { status: 404 });

  await logAccess({
    action: 'document.download',
    resourceType: 'document_version',
    resourceId: version.id,
    businessEntityId: version.business_entity_id,
  });

  return NextResponse.redirect(signed.signedUrl, {
    status: 302,
    headers: { 'Cache-Control': 'no-store' },
  });
}
