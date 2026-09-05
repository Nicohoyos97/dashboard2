// The KILL-PDF.md visual standard as one stylesheet. Sizes and colours are the
// standard's; nothing here is invented. Archivo travels with the document
// because @sparticuz/chromium ships without system fonts.
import { BRAND } from './brand';
import type { ReportAssets } from './report-assets';

const LATIN =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT =
  'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

export function fontFaces(assets: ReportAssets): string {
  return `@font-face { font-family: 'Archivo'; font-style: normal; font-weight: 100 900; font-display: block; src: url(${assets.fontLatinExt}) format('woff2'); unicode-range: ${LATIN_EXT}; }
@font-face { font-family: 'Archivo'; font-style: normal; font-weight: 100 900; font-display: block; src: url(${assets.fontLatin}) format('woff2'); unicode-range: ${LATIN}; }`;
}

export function reportStyles(assets: ReportAssets): string {
  return `${fontFaces(assets)}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: 'Archivo', Arial, sans-serif; color: ${BRAND.body}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
a { color: ${BRAND.blue}; text-decoration: none; }

/* ── Cover letter ──────────────────────────────────────────────────────── */
.cover { break-after: page; display: flex; flex-direction: column; min-height: 9.33in; padding: 0.23in 0.1in 0.2in; }
.letterhead { display: flex; align-items: center; justify-content: space-between; }
.letterhead-logo { height: 58px; mix-blend-mode: multiply; }
.letterhead-right { text-align: right; display: flex; flex-direction: column; gap: 2px; }
.letterhead-tagline { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${BRAND.navy}; }
.letterhead-site { font-size: 12px; font-weight: 500; }
.letterhead-bar { height: 3px; border-radius: 2px; margin: 4px 0 34px; background: linear-gradient(90deg, ${BRAND.navy} 0 38%, ${BRAND.blue} 38% 100%); }
.cover-date { margin: 0 0 26px; font-size: 14px; color: ${BRAND.secondary}; }
.cover-to { margin: 0 0 24px; font-size: 14.5px; line-height: 1.55; }
.cover-company { margin: 0; font-weight: 700; color: ${BRAND.navy}; }
.cover-attn { margin: 0; color: ${BRAND.secondary}; }
.cover-re { margin: 0 0 22px; font-size: 14.5px; font-weight: 700; color: ${BRAND.navy}; }
.cover-p { margin: 0 0 16px; font-size: 14.5px; line-height: 1.62; text-wrap: pretty; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 6px 0 22px; }
/* space-between so the figures stay on one line across all four cards even when a label wraps ('Capital de Trabajo'). */
.kpi { border: 1px solid ${BRAND.cardBorder}; border-radius: 6px; padding: 12px 14px; display: flex; flex-direction: column; justify-content: space-between; gap: 3px; }
.kpi-label { font-size: 10.5px; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; color: ${BRAND.secondary}; }
.kpi-value { font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
.signature { margin-top: auto; display: flex; flex-direction: column; gap: 2px; }
.signature-sincerely { margin-bottom: 6px; }
.signature-image { width: 180px; margin: 0 0 2px -6px; mix-blend-mode: multiply; }
.signature-rule { width: 265px; height: 1px; background: ${BRAND.navy}; margin-bottom: 8px; }
.signature-name { margin: 0; font-size: 14.5px; font-weight: 700; color: ${BRAND.navy}; }
.signature-role { margin: 0; font-size: 14px; color: ${BRAND.secondary}; }
.signature-contact { margin: 0; font-size: 14px; color: ${BRAND.secondary}; }

/* ── Statement pages ───────────────────────────────────────────────────── */
.statement-head { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 3px solid ${BRAND.navy}; padding-bottom: 10px; margin-bottom: 0; }
.statement-company { margin: 0; font-size: 16px; font-weight: 800; color: ${BRAND.navy}; }
.statement-title { margin: 2px 0 4px; font-size: 26px; font-weight: 700; color: ${BRAND.blue}; line-height: 1.1; }
.statement-period { margin: 0; font-size: 13px; color: ${BRAND.secondary}; }
.statement-logo { height: 46px; mix-blend-mode: multiply; }

table.statement { width: 100%; border-collapse: collapse; }
table.statement thead th { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: ${BRAND.navy}; text-align: right; padding: 14px 14px 8px; border-bottom: 1px solid ${BRAND.columnRule}; }
table.statement thead th.account { text-align: left; }
table.statement tr { break-inside: avoid; }
td { font-variant-numeric: tabular-nums; }

tr.section td { font-size: 13px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: ${BRAND.navy}; padding: 18px 14px 6px; }
tr.detail td { font-size: 13.5px; padding: 8px 14px; border-bottom: 1px solid ${BRAND.rowBorder}; }
tr.detail.zebra td { background: ${BRAND.zebra}; }
tr.detail.sub td { font-size: 12.5px; color: ${BRAND.secondary}; border-bottom-color: ${BRAND.subRowBorder}; }
tr.detail.sub td.account { padding-left: 34px; }
tr.total td { font-size: 14px; font-weight: 700; color: ${BRAND.navy}; padding: 10px 14px; border-top: 2px solid ${BRAND.navy}; }
tr.band td { font-size: 14px; font-weight: 800; color: ${BRAND.navy}; padding: 12px 14px; background: ${BRAND.highlight}; }
tr.band td.account { border-radius: 5px 0 0 5px; }
tr.band td:last-child { border-radius: 0 5px 5px 0; }
tr.final td { font-size: 15px; font-weight: 800; color: #ffffff; padding: 13px 14px; background: ${BRAND.navy}; }
tr.final td.account { border-radius: 5px 0 0 5px; }
tr.final td:last-child { border-radius: 0 5px 5px 0; }
tr.spacer td { padding: 6px 0; border: 0; }
td.account { text-align: left; }
td.amount { text-align: right; white-space: nowrap; }
td.negative { color: ${BRAND.negative}; }
tr.final td.negative { color: #FFC7C9; }`;
}
