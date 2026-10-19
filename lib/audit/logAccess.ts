// Append a row to audit_logs. Server-only: writes via the service-role client
// because audit_logs has no INSERT policy (Archetype A). actor/entity are derived
// from the session; never accept them from the caller. Log identifiers and counts,
// never content (INITIAL_PROMPT.md §3).
import { headers } from 'next/headers';
import { after } from 'next/server';
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

type LogOptions = {
  /**
   * A page view: the row is written once the response has gone out — `after()`,
   * which Vercel keeps alive until it finishes — so a render no longer waits on
   * a write it does not need. Everything is still logged (rule 5). Exports,
   * downloads and actions leave this off and write before they answer: what they
   * hand out is the thing being audited.
   */
  afterResponse?: boolean;
};

function failed(err: unknown): void {
  // Auditing must never break the user action it accompanies.
  console.error('[audit] logAccess failed:', err instanceof Error ? err.message : 'unknown');
}

export async function logAccess(input: LogInput, options: LogOptions = {}): Promise<void> {
  try {
    // Resolved now, inside the request: headers() and the session are not
    // available to an after() callback.
    const [user, entity, headerList] = await Promise.all([
      getCurrentUser(),
      getCurrentEntity(),
      headers(),
    ]);

    // x-forwarded-for is client-spoofable — informational audit metadata only,
    // never a security source of truth.
    const ip = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const row = {
      actor_id: user?.id ?? null,
      business_entity_id: input.businessEntityId ?? entity?.id ?? null,
      action: input.action,
      resource_type: input.resourceType ?? null,
      resource_id: input.resourceId ?? null,
      metadata: input.metadata ?? null,
      ip,
      user_agent: headerList.get('user-agent') ?? null,
    };

    const insert = async (): Promise<void> => {
      // supabase-js resolves with `{ error }` rather than throwing, so without
      // this check a lost audit row never reached the catch.
      const { error } = await createAdminClient().from('audit_logs').insert(row);
      if (error) throw new Error(`audit insert failed (${error.code})`);
    };
    if (options.afterResponse) {
      after(() => insert().catch(failed));
      return;
    }
    await insert();
  } catch (err) {
    failed(err);
  }
}
