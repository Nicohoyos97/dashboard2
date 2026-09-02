// Sign-up page. Renders the shared auth experience in sign-up mode. The in-page
// toggle keeps users on /signin#signup; this route is the direct entry point.
import { AuthExperience } from '@/components/auth/AuthExperience';

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectedFrom?: string }>;
}) {
  const params = await searchParams;
  return <AuthExperience initialMode="signup" redirectTo={params.redirectedFrom} />;
}
