// Page 1 of every client report: the cover letter (KILL-PDF.md §Document
// structure 1). Letterhead, the RE: line, the derived analysis, four KPI cards
// and the signature block pinned to the bottom.
//
// Every string that came from an uploaded document or a client-set name is
// escaped before it reaches the markup.
import { BRAND, FIRM } from './brand';
import type { ReportAssets } from './report-assets';
import { escapeHtml, fillTemplate } from './report-format';
import type { ReportLabels } from './report-labels';

export type KpiCard = {
  label: string;
  value: string;
  /** Renders in the KILL-PDF red. Set from the sign of the figure, never guessed. */
  negative?: boolean;
  /** The key figure — last card, tinted background. */
  highlight?: boolean;
};

export type CoverInput = {
  labels: ReportLabels;
  assets: ReportAssets;
  entityName: string;
  title: string;
  periodLabel: string;
  basisLabel: string;
  basisExplained: string;
  dateLabel: string;
  analysis: readonly string[];
  kpis: readonly KpiCard[];
};

function kpiCard(card: KpiCard): string {
  const background = card.highlight ? `background: ${BRAND.cardHighlight};` : '';
  const colour = card.negative ? BRAND.negative : BRAND.navy;
  return `<div class="kpi" style="${background}">
      <span class="kpi-label">${escapeHtml(card.label)}</span>
      <span class="kpi-value" style="color: ${colour};">${escapeHtml(card.value)}</span>
    </div>`;
}

export function coverSection(input: CoverInput): string {
  const t = input.labels;
  const intro = fillTemplate(t.intro, {
    title: input.title,
    company: input.entityName,
    period: input.periodLabel,
    basisExplained: input.basisExplained,
  });
  const re = fillTemplate(t.re, {
    title: input.title,
    period: input.periodLabel,
    basis: input.basisLabel,
  });

  return `<section class="cover">
  <div class="letterhead">
    <img class="letterhead-logo" src="${input.assets.logo}" alt="${escapeHtml(FIRM.name)}">
    <div class="letterhead-right">
      <span class="letterhead-tagline">${escapeHtml(t.tagline)}</span>
      <a class="letterhead-site" href="${FIRM.siteUrl}">${escapeHtml(FIRM.site)}</a>
    </div>
  </div>
  <div class="letterhead-bar"></div>
  <p class="cover-date">${escapeHtml(input.dateLabel)}</p>
  <div class="cover-to">
    <p class="cover-company">${escapeHtml(input.entityName)}</p>
    <p class="cover-attn">${escapeHtml(t.attn)}</p>
  </div>
  <p class="cover-re">${escapeHtml(re)}</p>
  <p class="cover-p">${escapeHtml(t.salutation)}</p>
  <p class="cover-p">${escapeHtml(intro)}</p>
  <div class="kpis">${input.kpis.map(kpiCard).join('')}</div>
  ${input.analysis.map((line) => `<p class="cover-p">${escapeHtml(line)}</p>`).join('\n  ')}
  <p class="cover-p">${escapeHtml(t.closing)}</p>
  <div class="signature">
    <p class="cover-p signature-sincerely">${escapeHtml(t.sincerely)}</p>
    <img class="signature-image" src="${input.assets.signature}" alt="">
    <div class="signature-rule"></div>
    <p class="signature-name">${escapeHtml(FIRM.signer)}</p>
    <p class="signature-role">${escapeHtml(`${FIRM.signerRole} · ${FIRM.name}`)}</p>
    <p class="signature-contact">${escapeHtml(`Tel: ${FIRM.tel}`)}</p>
    <p class="signature-contact">Email: <a href="mailto:${FIRM.email}">${escapeHtml(FIRM.email)}</a></p>
  </div>
</section>`;
}
