import { LogOut } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { signOut } from '@/lib/auth/actions';

export type ShellUser = { name: string; email: string; avatarUrl: string | null };

function initials(nameOrEmail: string): string {
  const parts = nameOrEmail.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

// Bottom of the sidebar: avatar, name, role, sign-out (INITIAL_PROMPT.md §7).
export async function UserBlock({
  user,
  roleLabel,
  profileHref,
}: {
  user: ShellUser;
  roleLabel: string;
  profileHref: string;
}) {
  const t = await getTranslations('Shell');
  const display = user.name.trim() || user.email;

  return (
    <div className="border-line mt-3 border-t pt-3">
      <div className="flex items-center gap-3 px-2 py-1.5">
        <Link
          href={profileHref}
          aria-label={t('profile')}
          className="border-line bg-secondary focus-visible:ring-blue/40 relative size-9 shrink-0 overflow-hidden rounded-full border outline-none focus-visible:ring-3"
        >
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, arbitrary host
            <img src={user.avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-muted-foreground flex size-full items-center justify-center text-[12px] font-bold">
              {initials(display)}
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-ink truncate text-[13.5px] font-semibold">{display}</p>
          <p className="text-muted-foreground truncate text-[12px]">{roleLabel}</p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            aria-label={t('signOut')}
            title={t('signOut')}
            className="text-muted-foreground hover:bg-secondary hover:text-danger focus-visible:ring-blue/40 inline-flex size-9 items-center justify-center rounded-lg outline-none focus-visible:ring-3"
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span className="sr-only">{t('signOut')}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
