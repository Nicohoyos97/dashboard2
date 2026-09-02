// Authenticated app shell sidebar: brand, top-level nav, business badge, and sign-out.
// The nav lives in SidebarNav (client) so it can highlight the active route and
// expand the Reports group.
import Image from 'next/image';

import { signOut } from '@/lib/auth/actions';

import { SidebarNav } from './SidebarNav';

export function Sidebar({ email, entityName }: { email: string; entityName: string }) {
  return (
    <aside className="border-border bg-card flex w-64 shrink-0 flex-col border-r p-5">
      <Image
        src="/brand/logo-wordmark.png"
        alt="Hoyos Baker"
        width={160}
        height={160}
        className="mb-6 h-10 w-auto"
      />

      {entityName && (
        <p className="bg-secondary text-ink mb-6 truncate rounded-[10px] px-3 py-2 text-[13px] font-semibold">
          {entityName}
        </p>
      )}

      <SidebarNav />

      <div className="border-border mt-auto border-t pt-4">
        <p className="text-muted-foreground mb-2 truncate px-3 text-[12.5px]">{email}</p>
        <form action={signOut}>
          <button
            type="submit"
            className="text-foreground hover:bg-secondary hover:text-danger w-full rounded-[10px] px-3 py-2 text-left text-[14px] font-medium transition"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
