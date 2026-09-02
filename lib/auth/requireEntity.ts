// Guard for server code that must run in a business-entity context. Returns the
// current entity, or redirects: unauthenticated → sign-in; signed in but not yet
// assigned to a business → the Overview, which renders the pending state. Use in
// Server Actions / Route Handlers that operate on tenant data.
import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { type CurrentEntity, getCurrentEntity } from './getCurrentEntity';
import { getCurrentUser } from './getCurrentUser';

export async function requireEntity(): Promise<CurrentEntity> {
  const user = await getCurrentUser();
  const locale = await getLocale();
  const prefix = locale === 'en' ? '' : `/${locale}`;
  if (!user) redirect(`${prefix}/signin`);

  const entity = await getCurrentEntity();
  if (!entity) redirect(`${prefix}/dashboard`);
  return entity;
}
