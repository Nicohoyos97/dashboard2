import { getTranslations } from 'next-intl/server';

/**
 * The change against the period before, as a pill on a 10% tint — the
 * hoyosbaker-voice KPI pill, brought to the portal.
 *
 * The colour says good or bad, never up or down: expenses rising is danger and
 * expenses falling is success, so the caller says which direction is good. The
 * arrow is a character rather than a coloured glyph, so the pill still reads
 * in greyscale, and a screen reader hears the words, not the triangle.
 *
 * `change` is the figure as it will be read — already rounded the way
 * `magnitude` prints it — so a change that prints as 0.0% is flat and grey
 * rather than a green arrow over a zero.
 */
export async function DeltaPill({
  change,
  magnitude,
  upIsGood,
}: {
  change: number;
  /** The unsigned size of the change, formatted: "12.3%", "$1,200.00", "4.0 pts". */
  magnitude: string;
  upIsGood: boolean;
}) {
  const t = await getTranslations('Overview');
  if (change === 0) {
    return <Pill tone="muted" arrow="—" text={magnitude} label={t('deltaFlat')} />;
  }
  const up = change > 0;
  const good = up === upIsGood;
  return (
    <Pill
      tone={good ? 'success' : 'danger'}
      arrow={up ? '▲' : '▼'}
      text={`${up ? '+' : '−'}${magnitude}`}
      label={t(up ? 'deltaUp' : 'deltaDown', { amount: magnitude })}
    />
  );
}

const TONE = {
  success: 'bg-success/10 text-success',
  danger: 'bg-danger/10 text-danger',
  muted: 'bg-secondary text-muted-foreground',
} as const;

function Pill({ tone, arrow, text, label }: { tone: keyof typeof TONE; arrow: string; text: string; label: string }) {
  return (
    <span className={`relative z-10 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[12.5px] font-semibold ${TONE[tone]}`}>
      <span aria-hidden="true" className="text-[9px] leading-none">{arrow}</span>
      <span aria-hidden="true" className="tabular-nums">{text}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** The tone a trend line takes, so the line and the pill never disagree. */
export function deltaTone(change: number | null, upIsGood: boolean): 'positive' | 'negative' | 'neutral' {
  if (change === null || change === 0) return 'neutral';
  return change > 0 === upIsGood ? 'positive' : 'negative';
}
