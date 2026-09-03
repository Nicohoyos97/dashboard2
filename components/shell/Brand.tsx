import Image from 'next/image';

import { Link } from '@/i18n/navigation';

// Logo + optional portal badge, used by the sidebar and the mobile top bar of
// both portals. The lockup is a wide 445×107 image, so it is sized by height
// and left to find its own width — at h-8 it comes to ~133 px, well inside the
// 248 px sidebar. (The sign-in page keeps the square wordmark.)
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
    <Link href={href} className="flex items-center gap-2.5" aria-label="BizGrowth by Hoyos Baker">
      {/* The lockup's "By Hoyos" is dark navy and vanishes on the dark sidebar.
          Until a dark-surface variant exists (public/brand/README.md), the mark
          keeps its own colours on a light plate in dark mode. */}
      <span className="dark:bg-white inline-flex items-center rounded-lg dark:px-2 dark:py-1.5">
        <Image
          src="/brand/bizgrowth-lockup.png"
          alt="BizGrowth by Hoyos Baker"
          width={445}
          height={107}
          priority
          className={compact ? 'h-6 w-auto' : 'h-8 w-auto'}
        />
      </span>
      {badge && (
        <span className="bg-blue-pale text-blue rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-[0.02em]">
          {badge}
        </span>
      )}
    </Link>
  );
}
