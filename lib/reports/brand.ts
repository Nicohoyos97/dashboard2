// The Hoyos Baker report design standard (KILL-PDF.md), as constants.
//
// These are the firm's document colours and identity, deliberately NOT the
// app's screen tokens: the portal is blue #2563EB on white cards, a client
// report is navy letterhead on paper. Changing anything here changes every
// client-facing PDF, so it tracks KILL-PDF.md and nothing else.

export const BRAND = {
  navy: '#0A2457',
  blue: '#0C77DC',
  body: '#14213A',
  secondary: '#4A5872',
  muted: '#8A94A6',
  cardBorder: '#DDE6F2',
  rowBorder: '#E9EFF7',
  columnRule: '#C9D6E8',
  subRowBorder: '#F0F4FA',
  zebra: '#F5F8FC',
  highlight: '#EAF3FC',
  cardHighlight: '#F4F8FD',
  negative: '#B4232A',
  footerRule: '#E3EAF4',
} as const;

export const FIRM = {
  name: 'Hoyos Baker',
  tagline: 'Bookkeeping & Accounting',
  site: 'hoyosbaker.com',
  siteUrl: 'https://hoyosbaker.com',
  signer: 'Nicolas Hoyos Restrepo',
  signerRole: 'Account Specialist',
  tel: '(773) 416-9438',
  email: 'nicolas.hoyos@hoyosbaker.com',
} as const;

/** US Letter with the KILL-PDF page bands. The top and bottom bands hold the running header and footer. */
export const PAGE_MARGIN = {
  top: '0.62in',
  bottom: '0.55in',
  left: '0.8in',
  right: '0.8in',
} as const;

/** Same bands in points, for the pdf-lib pass that clears them on the cover. */
export const PAGE_BAND_PT = { top: 0.62 * 72, bottom: 0.55 * 72 } as const;
