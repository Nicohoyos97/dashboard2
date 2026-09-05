// The whole client report as one HTML document, printed by Chromium.
//
// Chrome paginates: the cover breaks after itself, the table's <thead> repeats
// its column labels on every page, and the running header and footer come from
// Puppeteer's own templates. Rows carry the KILL-PDF classes; the two banded
// lines (the key subtotal and the closing figure) are identified by line id
// from the metric models, never by matching text here.
import { BRAND, FIRM } from './brand';
import type { ReportAssets } from './report-assets';
import { type CoverInput, coverSection } from './report-cover';
import { escapeHtml, fillTemplate } from './report-format';
import type { ReportLabels } from './report-labels';
import { fontFaces, reportStyles } from './report-styles';
import { flattenTree } from './tree';
import type { LineNode } from './types';

export type Bands = { highlight: string | null; final: string | null };

export type StatementColumn = { label: string; value: (line: LineNode) => number | null };

export type ReportHtmlInput = {
  labels: ReportLabels;
  assets: ReportAssets;
  entityName: string;
  title: string;
  periodLabel: string;
  basisLabel: string;
  currency: string;
  roots: readonly LineNode[];
  columns: readonly StatementColumn[];
  bands: Bands;
  format: (cents: number | null) => string;
  formatTotal: (cents: number | null) => string;
  cover: Omit<
    CoverInput,
    'labels' | 'assets' | 'entityName' | 'title' | 'periodLabel' | 'basisLabel'
  >;
};

function amountCell(text: string, cents: number | null, extra: string): string {
  const negative = cents !== null && cents < 0 ? ' negative' : '';
  return `<td class="amount${negative}${extra}">${escapeHtml(text)}</td>`;
}

function row(line: LineNode, input: ReportHtmlInput, striped: boolean): string {
  const banded =
    line.id === input.bands.final ? 'final' : line.id === input.bands.highlight ? 'band' : null;
  const isTotal = banded === null && line.isTotal;
  const kind = banded ?? (isTotal ? 'total' : line.isSection ? 'section' : 'detail');
  const emphasised = kind !== 'detail';
  const money = emphasised ? input.formatTotal : input.format;

  if (kind === 'section') {
    const pad = 14 + line.depth * 20;
    return `<tr class="section"><td class="account" colspan="${input.columns.length + 1}" style="padding-left: ${pad}px;">${escapeHtml(line.accountName)}</td></tr>`;
  }

  const sub = kind === 'detail' && line.depth >= 2 ? ' sub' : '';
  const zebra = kind === 'detail' && striped ? ' zebra' : '';
  const indent = kind === 'detail' && line.depth === 1 ? ' style="padding-left: 24px;"' : '';
  const cells = input.columns
    .map((column) => {
      const cents = column.value(line);
      return amountCell(money(cents), cents, '');
    })
    .join('');
  return `<tr class="${kind}${sub}${zebra}"><td class="account"${indent}>${escapeHtml(line.accountName)}</td>${cells}</tr>`;
}

function tableBody(input: ReportHtmlInput): string {
  const lines = flattenTree(input.roots);
  let striped = true;
  return lines
    .map((line) => {
      if (line.isSection) {
        striped = true;
        return row(line, input, false);
      }
      const isDetail =
        !line.isTotal && line.id !== input.bands.final && line.id !== input.bands.highlight;
      const html = row(line, input, isDetail && striped);
      if (isDetail) striped = !striped;
      else striped = true;
      return html;
    })
    .join('\n      ');
}

/** What the PDF is called in a viewer's tab and in its metadata. */
export function documentTitle(input: ReportHtmlInput): string {
  return `${input.title} — ${input.entityName} — ${input.periodLabel}`;
}

export function reportHtml(input: ReportHtmlInput): string {
  const t = input.labels;
  const head = input.columns
    .map((column) => `<th class="amount">${escapeHtml(column.label)}</th>`)
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(documentTitle(input))}</title><style>${reportStyles(input.assets)}</style></head>
<body>
${coverSection({ ...input.cover, labels: t, assets: input.assets, entityName: input.entityName, title: input.title, periodLabel: input.periodLabel, basisLabel: input.basisLabel })}
<section class="statement">
  <header class="statement-head">
    <div>
      <p class="statement-company">${escapeHtml(input.entityName)}</p>
      <p class="statement-title">${escapeHtml(input.title)}</p>
      <p class="statement-period">${escapeHtml(`${input.periodLabel} · ${input.basisLabel}`)}</p>
    </div>
    <img class="statement-logo" src="${input.assets.logo}" alt="">
  </header>
  <table class="statement">
    <thead><tr><th class="account"></th>${head}</tr></thead>
    <tbody>
      ${tableBody(input)}
    </tbody>
  </table>
</section>
</body></html>`;
}

/** Compact continuation header. Chromium prints it on every page; the cover and the first statement page are cleared afterwards. */
export function headerTemplate(input: ReportHtmlInput): string {
  const trail = `${input.title} (${input.labels.continued}) · ${input.periodLabel} · ${input.basisLabel}`;
  return `<style>${fontFaces(input.assets)}</style>
<div style="width: 100%; padding: 0 0.8in; font-family: 'Archivo', Arial, sans-serif; -webkit-print-color-adjust: exact;">
  <div style="display: flex; align-items: flex-end; justify-content: space-between; border-bottom: 2px solid ${BRAND.navy}; padding-bottom: 5px;">
    <div>
      <div style="font-size: 13px; font-weight: 700; color: ${BRAND.navy};">${escapeHtml(input.entityName)}</div>
      <div style="font-size: 12px; color: ${BRAND.secondary};">${escapeHtml(trail)}</div>
    </div>
    <img src="${input.assets.logo}" style="height: 30px; mix-blend-mode: multiply;">
  </div>
</div>`;
}

/** KILL-PDF §5. Page numbering spans the whole document, cover included. */
export function footerTemplate(input: ReportHtmlInput): string {
  const left = fillTemplate(input.labels.footerLeft, {
    firm: FIRM.name,
    signer: FIRM.signer,
    role: FIRM.signerRole,
  });
  const right = fillTemplate(input.labels.footerRight, {
    basis: input.basisLabel,
    currency: input.currency,
  });
  return `<style>${fontFaces(input.assets)}</style>
<div style="width: 100%; padding: 6px 0.8in 0; font-family: 'Archivo', Arial, sans-serif; font-size: 10.5px; color: ${BRAND.secondary}; -webkit-print-color-adjust: exact;">
  <div style="display: flex; justify-content: space-between; border-top: 1px solid ${BRAND.footerRule}; padding-top: 6px;">
    <span>${escapeHtml(left)}</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span> · ${escapeHtml(right)}</span>
  </div>
</div>`;
}
