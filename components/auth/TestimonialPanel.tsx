'use client';

import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useEffect, useState } from 'react';

const REVIEW_COUNT = 3;
const ROTATION_MS = 7_000;

export function TestimonialPanel() {
  const t = useTranslations('Auth');
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (paused || reducedMotion) return;
    const timer = window.setInterval(
      () => setActive((current) => (current + 1) % REVIEW_COUNT),
      ROTATION_MS,
    );
    return () => window.clearInterval(timer);
  }, [paused]);

  return (
    <section
      aria-label={t('testimonialRegion')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
      className="relative hidden overflow-hidden rounded-[28px] lg:block"
    >
      {/* `1px` below the breakpoint: display:none does not stop a browser from fetching
          an <img>, and `priority` preloads it, so a phone would download the photo it
          never sees. This makes the smallest srcset candidate the one it picks. */}
      <Image
        src="/auth/business-owner.jpg"
        alt=""
        fill
        priority
        sizes="(min-width: 1024px) 40vw, 1px"
        className="object-cover object-[44%_center]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/12 to-black/5"
      />

      <div className="absolute inset-x-0 bottom-0 z-10 p-4 text-white sm:p-6 lg:p-7 xl:p-9">
        {/* Frosted card. What keeps the white text legible is the scrim beneath it, not
            the tint — so it still reads where backdrop-filter is unsupported and no blur
            lands. Measured worst case behind the quote: 5:1. */}
        <div className="relative overflow-hidden rounded-[22px] border border-white/25 bg-white/10 p-6 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)] backdrop-blur-2xl backdrop-saturate-150 sm:p-7 xl:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-transparent"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent"
          />
          {/* One grid cell for all three: the card is as tall as the longest quote at
              this width, so no min-height has to be guessed per breakpoint and per
              language — a Spanish quote that wrapped one line further used to be clipped. */}
          <div className="grid">
            {Array.from({ length: REVIEW_COUNT }, (_, index) => (
              <article
                key={index}
                aria-hidden={active !== index}
                className={`col-start-1 row-start-1 flex flex-col justify-center transition-opacity duration-700 motion-reduce:transition-none ${active === index ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
              >
                {/* role="img": a bare div may not carry aria-label, so the rating had no
                  accessible name at all — the stars inside are decorative. */}
                <div
                  role="img"
                  className="text-warning mb-4 flex gap-1"
                  aria-label={t('fiveStars')}
                >
                  {Array.from({ length: 5 }, (_, star) => (
                    <Star key={star} className="size-[18px] fill-current" aria-hidden="true" />
                  ))}
                </div>
                <blockquote className="max-w-[760px] text-[clamp(1.125rem,1.6vw,1.65rem)] leading-[1.28] font-medium tracking-[-0.025em] text-balance">
                  “{t(`testimonial${index + 1}Quote`)}”
                </blockquote>
                <div className="mt-5">
                  <p className="text-[15px] font-semibold">{t(`testimonial${index + 1}Name`)}</p>
                  <p className="mt-0.5 text-[13px] text-white/75">
                    {t(`testimonial${index + 1}Role`)}
                  </p>
                </div>
              </article>
            ))}
          </div>

          <div
            className="mt-5 flex justify-end gap-2"
            role="group"
            aria-label={t('testimonialNavigation')}
          >
            {Array.from({ length: REVIEW_COUNT }, (_, index) => (
              <button
                key={index}
                type="button"
                aria-label={t('testimonialGoTo', { number: index + 1 })}
                aria-pressed={active === index}
                onClick={() => setActive(index)}
                className={`focus-visible:ring-blue/70 h-2.5 rounded-full transition-all outline-none focus-visible:ring-3 motion-reduce:transition-none ${active === index ? 'w-8 bg-white' : 'w-2.5 bg-white/45 hover:bg-white/75'}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
