import Image from 'next/image';

import { Link } from '@/i18n/navigation';

// Logo + optional portal badge, used by the sidebar and the mobile top bar of
// both portals. The lockup is a wide ~445×107 image, so it is sized by height
// and left to find its own width — at h-8 it comes to ~133 px, well inside the
// 248 px sidebar. (The sign-in page keeps the square wordmark.)
//
// Both variants render and CSS picks one: the theme lives in a class on <html>
// applied before paint, so swapping in markup avoids the flash a JS-side
// choice would cause, and neither theme ever shows the wrong artwork.
const LOCKUPS = [
  { src: '/brand/bizgrowth-lockup.png', width: 445, visibility: 'dark:hidden' },
  { src: '/brand/bizgrowth-lockup-dark.png', width: 442, visibility: 'hidden dark:block' },
] as const;

export function Brand({
  href,
  badge,
  compact,
}: {
  href: string;
  badge?: string;
  compact?: boolean;
}) {
  // `object-contain` only matters compact: the mobile bar now also carries the
  // bell, the theme toggle and the Reports action, so at 320 px — the width
  // WCAG reflow is measured at — the lockup is the flex item that gives, and
  // without it a shrunk width would squash the artwork rather than scale it.
  const height = compact ? 'h-6 w-auto object-contain' : 'h-8 w-auto';
  // Full variant stacks the badge under the lockup, where the sidebar has the
  // vertical room and the pair reads as one title block. The compact variant
  // shares the mobile top bar with a 40 px menu button, so it stays on one line
  // rather than growing the bar.
  const layout = compact ? 'flex items-center gap-2.5' : 'flex flex-col items-start gap-1.5';
  return (
    <Link href={href} className={layout} aria-label="BizGrowth by Hoyos Baker">
      {LOCKUPS.map((lockup) => (
        <Image
          key={lockup.src}
          src={lockup.src}
          // The link carries the accessible name; the images would only repeat it.
          alt=""
          width={lockup.width}
          height={107}
          priority
          className={`${height} ${lockup.visibility}`}
        />
      ))}
      {badge && (
        <span className="bg-blue-pale text-blue rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-[0.02em]">
          {badge}
        </span>
      )}
    </Link>
  );
}
