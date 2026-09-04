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
      className="relative mx-3 mb-3 min-h-[430px] overflow-hidden rounded-[26px] lg:mx-0 lg:mb-0 lg:min-h-0 lg:rounded-[28px]"
    >
      <Image
        src="/auth/business-owner.jpg"
        alt=""
        fill
        priority
        sizes="(max-width: 1023px) calc(100vw - 24px), 40vw"
        className="object-cover object-[44%_center]"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/5" />

      <div className="absolute inset-x-0 bottom-0 z-10 p-6 text-white sm:p-9 lg:p-10 xl:p-14">
        <div className="relative min-h-[220px] sm:min-h-[190px] xl:min-h-[220px]">
          {Array.from({ length: REVIEW_COUNT }, (_, index) => (
            <article
              key={index}
              aria-hidden={active !== index}
              className={`absolute inset-0 flex flex-col justify-end transition-opacity duration-700 motion-reduce:transition-none ${active === index ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
            >
              {/* role="img": a bare div may not carry aria-label, so the rating had no
                  accessible name at all — the stars inside are decorative. */}
              <div role="img" className="mb-4 flex gap-1 text-warning" aria-label={t('fiveStars')}>
                {Array.from({ length: 5 }, (_, star) => (
                  <Star key={star} className="size-[18px] fill-current" aria-hidden="true" />
                ))}
              </div>
              <blockquote className="max-w-[760px] text-[clamp(1.25rem,2.1vw,2rem)] leading-[1.28] font-medium tracking-[-0.025em] text-balance">
                “{t(`testimonial${index + 1}Quote`)}”
              </blockquote>
              <div className="mt-5">
                <p className="text-[15px] font-semibold">{t(`testimonial${index + 1}Name`)}</p>
                <p className="mt-0.5 text-[13px] text-white/75">{t(`testimonial${index + 1}Role`)}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-5 flex justify-end gap-2" role="group" aria-label={t('testimonialNavigation')}>
          {Array.from({ length: REVIEW_COUNT }, (_, index) => (
            <button
              key={index}
              type="button"
              aria-label={t('testimonialGoTo', { number: index + 1 })}
              aria-pressed={active === index}
              onClick={() => setActive(index)}
              className={`focus-visible:ring-blue/70 h-2.5 rounded-full outline-none transition-all focus-visible:ring-3 motion-reduce:transition-none ${active === index ? 'w-8 bg-white' : 'w-2.5 bg-white/45 hover:bg-white/75'}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
