import Image from 'next/image';

import { Link } from '@/i18n/navigation';

// Logo + optional portal badge, used by the sidebar and the mobile top bar.
export function Brand({
  href,
  badge,
  compact,
}: {
  href: string;
  badge?: string;
  compact?: boolean;
}) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="Hoyos Baker">
      <Image
        src="/brand/logo-wordmark.png"
        alt="Hoyos Baker"
        width={160}
        height={160}
        priority
        className={compact ? 'h-8 w-auto' : 'h-12 w-auto'}
      />
      {badge && (
        <span className="bg-blue-pale text-blue rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-[0.02em]">
          {badge}
        </span>
      )}
    </Link>
  );
}
