// Auth shell (inherited from v1; restyle to INITIAL_PROMPT.md §6 in Phase 1). A centered card
// split into a left visual panel (photo + glass value-prop) and a right form
// column (children). Tokens from app/globals.css (INITIAL_PROMPT.md §6); pill controls.
import { useTranslations } from 'next-intl';
import Image from 'next/image';

export function AuthSplit({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-paper flex min-h-screen items-center justify-center p-4 md:p-8">
      <main className="border-line bg-card flex min-h-[600px] w-full max-w-[1000px] flex-col overflow-hidden rounded-[24px] border shadow-[0_10px_25px_-5px_rgba(15,23,42,0.05),0_8px_10px_-6px_rgba(15,23,42,0.05)] md:flex-row">
        <VisualPanel />
        <section className="bg-card flex w-full flex-col justify-center p-8 md:w-1/2 md:p-12">
          <div className="mx-auto w-full max-w-[380px]">{children}</div>
        </section>
      </main>
    </div>
  );
}

function VisualPanel() {
  const t = useTranslations('Auth');
  return (
    <section className="relative flex min-h-[300px] w-full flex-col justify-between overflow-hidden p-8 md:min-h-full md:w-1/2">
      {/* PLACEHOLDER PHOTO — unlicensed Stitch/Google stock. Replace with a
          licensed image before production (tracked in docs/ASSUMPTIONS.md). */}
      <Image
        src="/auth/owner-placeholder.png"
        alt=""
        fill
        priority
        sizes="(min-width: 768px) 50vw, 100vw"
        className="object-cover object-center"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-transparent"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"
      />

      <span className="relative text-[15px] font-bold tracking-tight text-white">Hoyos Baker</span>

      <div className="relative rounded-[18px] border border-white/30 bg-white/20 p-6 backdrop-blur-md">
        <h2 className="text-[28px] leading-tight font-bold tracking-tight text-white">
          {t('valuePropTitle')}
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-white/85">{t('valuePropBody')}</p>
      </div>
    </section>
  );
}
