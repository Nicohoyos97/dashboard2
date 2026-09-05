# KILL-PDF — Hoyos Baker Report Design Standard

Binding spec for ALL client-facing financial documents (Profit & Loss, Balance Sheets, Sales Taxes, Income Taxes, and any other report). Always light theme. Always letter size, print-ready via doc-page.

## Brand
- Navy (primary): `#0A2457` — headings, totals, borders, NET INCOME band
- Blue (accent): `#0C77DC` — report title, links, letterhead bar
- Body text: `#14213A` · Secondary text: `#4A5872` · Muted: `#8A94A6`
- Borders: `#DDE6F2` (cards), `#E9EFF7` (table rows), `#C9D6E8` (column header rule)
- Zebra stripe: `#F5F8FC` · Highlight band (Gross Profit): `#EAF3FC` · Card highlight: `#F4F8FD`
- Negative amounts: `#B4232A`, formatted `$(10,542.31)`
- Font: **Archivo** (Google Fonts, weights 400–800). Emails: Arial.

## Assets (public URLs — use these, never local copies, so PDFs/emails always resolve)
- Logo: `https://hoyosbaker.com/assets/hoyos-baker-logo.png` (use `mix-blend-mode: multiply`)
- Signature: `https://hoyosbaker.com/assets/nicolas-hoyos-signature.png` (~170–190px wide, multiply)

## Identity
- Nicolas Hoyos Restrepo — Account Specialist · Hoyos Baker
- Tel: (773) 416-9438 · Email: nicolas.hoyos@hoyosbaker.com · hoyosbaker.com
- Team sender: "Hoyos Baker Team — Business Services Department" · info@hoyosbaker.com

## Document structure (every report)
1. **Page 1 — Cover letter** (padding 0.85in 0.9in):
   - Letterhead: logo left (~58px), right column "BOOKKEEPING & ACCOUNTING" + hoyosbaker.com
   - 3px gradient bar under letterhead: navy 38% / blue 62%
   - Date, client block (bold navy name + "Attn: Management"), bold navy RE: line with period + basis
   - 1–2 short analysis paragraphs (14.5px, line-height 1.62)
   - 4 KPI cards in a grid (1px `#DDE6F2` border, radius 6px; last card = key figure, bg `#F4F8FD`, negative in red)
   - Signature block pinned at bottom-left: "Sincerely," + signature image + 1px navy rule + name (bold navy) + "Account Specialist · Hoyos Baker" + Tel / Email on separate lines
2. **Statement pages** (padding ~0.55–0.65in 0.8in):
   - First statement page header: company name (16px, 800, navy), report title (26px, 700, blue), period + basis (13px), logo right (~46px), 3px navy bottom border
   - Continuation pages: compact header (13px company, 12px "Report (continued) · period · basis"), logo 46px, 2px navy border
   - Right-aligned column label "TOTAL (USD)" (11px, 700, letter-spacing 0.12em)
3. **Table style** (QuickBooks-like, zebra):
   - Section headers: UPPERCASE, 13px, 800, navy, letter-spacing 0.1em
   - Detail rows: 13.5px, padding 8px 14px, alternating `#F5F8FC` stripe, 1px `#E9EFF7` bottom border, amounts right with `font-variant-numeric: tabular-nums`
   - Sub-accounts: 12.5px, indented 34px, color `#4A5872`, lighter `#F0F4FA` borders
   - Section totals: 14px, 700, navy, 2px navy top border, `$` prefix
   - Key subtotal band (e.g. GROSS PROFIT): bg `#EAF3FC`, radius 5px, 800 navy
   - Final band (NET INCOME / TAX DUE / TOTAL): navy bg, white, 15px, 800, radius 5px
4. **Never cram**: rows stay ≥13px — add a new page instead of shrinking type. Split long sections ("EXPENSES (CONTINUED)").
5. **Footers** every statement page: left "Prepared by Hoyos Baker · Nicolas Hoyos Restrepo, Account Specialist"; right "Page X of Y · Cash Basis · All amounts in USD" (or "Continued on next page"); 1px `#E3EAF4` top border, 10.5px.
6. **Last page**: centered signature block after the final band — signature image, 1px navy rule, name, "Account Specialist · Hoyos Baker".

## Tweaks (standard props)
- `basis`: enum "Cash Basis" / "Accrual Basis"
- `showSubAccounts`: boolean
- `showLogoOnStatement`: boolean

## Reference implementation
`Sabor a Cafe P&L 2025.dc.html` — copy and adapt it for new reports.
