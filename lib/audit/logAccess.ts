// Append a row to audit_logs. Server-only: writes via the service-role client
// because audit_logs has no INSERT policy (Archetype A). actor/entity are derived
// from the session; never accept them from the caller. Log identifiers and counts,
// never content (INITIAL_PROMPT.md §3).
import { headers } from 'next/headers';
import 'server-only';

import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/types';

type LogInput = {
  action: string; // e.g. 'document.download', 'report.export.csv', 'chat.message.sent'
  resourceType?: string;
  resourceId?: string;
  metadata?: Json; // SMALL — no PII, no financial figures
  // Firm actions name the tenant they act on (a firm admin has no membership,
  // so getCurrentEntity() would yield null). Client actions leave it unset.
  businessEntityId?: string | null;
};

export async function logAccess(input: LogInput): Promise<void> {
  try {
    const [user, entity, headerList] = await Promise.all([
      getCurrentUser(),
      getCurrentEntity(),
      headers(),
    ]);

    // x-forwarded-for is client-spoofable — informational audit metadata only,
    // never a security source of truth.
    const ip = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

    await createAdminClient()
      .from('audit_logs')
      .insert({
        actor_id: user?.id ?? null,
        business_entity_id: input.businessEntityId ?? entity?.id ?? null,
        action: input.action,
        resource_type: input.resourceType ?? null,
        resource_id: input.resourceId ?? null,
        metadata: input.metadata ?? null,
        ip,
        user_agent: headerList.get('user-agent') ?? null,
      });
  } catch (err) {
    // Auditing must never break the user action it accompanies.
    console.error('[audit] logAccess failed:', err instanceof Error ? err.message : 'unknown');
  }
}
