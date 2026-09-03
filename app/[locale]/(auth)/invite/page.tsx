// Invite acceptance (INITIAL_PROMPT.md §8 "invite users"). Supabase's invite
// link lands here with the session in the URL fragment (implicit flow — the
// link was generated server-side, so there is no PKCE verifier). Only the
// browser client can read the fragment, so the whole step is client-side:
// pick up the session, set a password, continue to the Overview.
import { getTranslations } from 'next-intl/server';

import { AcceptInviteForm } from '@/components/auth/AcceptInviteForm';
import { AuthScaffold } from '@/components/auth/AuthScaffold';

export default async function InvitePage() {
  const t = await getTranslations('Auth');
  return (
    <AuthScaffold title={t('inviteTitle')} lede={t('inviteLede')}>
      <AcceptInviteForm />
    </AuthScaffold>
  );
}
