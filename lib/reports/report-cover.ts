// Page 1 of every client report: the cover letter, laid out after the firm's
// P&L Cover Letter Template (KILL-PDF.md §Document structure 1). Letterhead,
// date, client, the document · period · basis line, the letter, four KPI
// cards, the signature block pinned to the bottom and the enclosure footer.
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
  dateLabel: string;
  /** Document · period · basis, in the letter's language. */
  heading: string;
  /** What is enclosed, for when, on what basis, and what it summarizes. */
  intro: string;
  enclosure: string;
  kpis: readonly KpiCard[];
};

/** "Prepared by Hoyos Baker · Nicolas Hoyos Restrepo, Account Specialist" — the cover and every statement page. */
export function preparedBy(labels: ReportLabels): string {
  return fillTemplate(labels.footerLeft, {
    firm: FIRM.name,
    signer: FIRM.signer,
    role: FIRM.signerRole,
  });
}

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
  <p class="cover-company">${escapeHtml(input.entityName)}</p>
  <p class="cover-heading">${escapeHtml(input.heading)}</p>
  <div class="cover-body">
    <p class="cover-p">${escapeHtml(t.salutation)}</p>
    <p class="cover-p">${escapeHtml(input.intro)}</p>
    <p class="cover-p">${escapeHtml(t.review)}</p>
  </div>
  <div class="kpis">${input.kpis.map(kpiCard).join('')}</div>
  <p class="cover-p cover-closing">${escapeHtml(t.closing)}</p>
  <div class="signature">
    <p class="signature-sincerely">${escapeHtml(t.sincerely)}</p>
    <img class="signature-image" src="${input.assets.signature}" alt="">
    <div class="signature-rule"></div>
    <p class="signature-name">${escapeHtml(FIRM.signer)}</p>
    <p class="signature-detail">${escapeHtml(`${FIRM.signerRole} · ${FIRM.name}`)}</p>
    <p class="signature-detail">${escapeHtml(`Tel: ${FIRM.tel}`)}</p>
    <p class="signature-detail">Email: <a href="mailto:${FIRM.email}">${escapeHtml(FIRM.email)}</a></p>
  </div>
  <div class="cover-footer">
    <span>${escapeHtml(preparedBy(t))}</span>
    <span>${escapeHtml(input.enclosure)}</span>
  </div>
</section>`;
}
