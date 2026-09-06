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
//
// The compact bar — the only logo a phone sees — carries the mark alone
// instead: the wordmark spent ~100 px of a 390 px bar that also holds the menu,
// the bell, the theme toggle and the page's own action, and the client already
// knows whose app they opened. One artwork serves both themes here, the way it
// does in the lockups' own illustration.
const LOCKUPS = [
  { src: '/brand/bizgrowth-lockup.png', width: 445, visibility: 'dark:hidden' },
  { src: '/brand/bizgrowth-lockup-dark.png', width: 442, visibility: 'hidden dark:block' },
] as const;

const MARK = { src: '/brand/bizgrowth-mark.png', size: 512 } as const;

export function Brand({
  href,
  badge,
  compact,
}: {
  href: string;
  badge?: string;
  compact?: boolean;
}) {
  // Full variant stacks the badge under the lockup, where the sidebar has the
  // vertical room and the pair reads as one title block. The compact variant
  // shares the mobile top bar with a 40 px menu button, so it stays on one line
  // rather than growing the bar.
  const layout = compact ? 'flex items-center gap-2.5' : 'flex flex-col items-start gap-1.5';
  return (
    <Link href={href} className={layout} aria-label="BizGrowth by Hoyos Baker">
      {compact ? (
        <Image
          src={MARK.src}
          // The link carries the accessible name; the image would only repeat it.
          alt=""
          width={MARK.size}
          height={MARK.size}
          // 40 px on the screen out of a 512 px file: without `sizes` next/image
          // serves the 1080 px candidate to a phone, which is the whole artwork
          // downloaded for a thumbnail.
          sizes="40px"
          priority
          className="size-10 shrink-0"
        />
      ) : (
        LOCKUPS.map((lockup) => (
          <Image
            key={lockup.src}
            src={lockup.src}
            alt=""
            width={lockup.width}
            height={107}
            priority
            className={`h-8 w-auto ${lockup.visibility}`}
          />
        ))
      )}
      {badge && (
        <span className="bg-blue-pale text-blue rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-[0.02em]">
          {badge}
        </span>
      )}
    </Link>
  );
}
