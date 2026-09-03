import Image from 'next/image';

import { cn } from '@/lib/utils/cn';

// Nick's orb: the owner's gradient blob (public/brand/nick-orb.png). It
// breathes at rest and quickens while Nick is thinking or answering; the
// motion lives in globals.css (.nick-orb) and stops under reduced motion.
export function NickOrb({
  size = 40,
  active = false,
  className,
}: {
  size?: number;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-active={active ? 'true' : 'false'}
      className={cn('nick-orb', className)}
      style={{ width: size, height: size }}
    >
      <span className="nick-orb__glow" />
      <span className="nick-orb__spin">
        <Image
          src="/brand/nick-orb.png"
          alt=""
          fill
          sizes={`${size}px`}
          priority={size >= 96}
          className="nick-orb__image"
        />
      </span>
    </span>
  );
}
