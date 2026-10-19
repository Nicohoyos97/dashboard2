---
name: Hoyos Baker Client Portal
description: Visual system of the client and firm portals. Tokens live in app/globals.css (@theme); this file is the human description of them.
colors:
  brand_identity: "#2D6CFF"
  primary: "#2563EB"
  primary_hover: "#1D4ED8"
  primary_soft: "#EEF5FF"
  link: "#2563EB"
  link_dark: "#60A5FA"
  background: "#F7F9FC"
  background_alt: "#F1F5F9"
  surface: "#FFFFFF"
  heading: "#0F172A"
  muted: "#64748B"
  border: "#E6ECF4"
  border_soft: "#EEF2F7"
  success: "#10B981"
  warning: "#F59E0B"
  danger: "#EF4444"
  info: "#3B82F6"
  dark_background: "#08111F"
  dark_surface: "#0F1B2D"
  dark_border: "#26364D"
  dark_muted: "#9AABC1"
  dark_primary_soft: "#142B55"
typography:
  family: Inter (variable), system-ui fallback
  scale: "micro 11 · caption 12 · small 13 · ui 14 · body 15 · title 16 · heading 18 · stat 22 · display 28 · hero 32"
  body: 15px / 1.55, weight 400
  label: 13px, weight 500
  nav: 14px, weight 400 (600 when current)
  heading_page: 28px, weight 700, tracking -0.02em
  heading_card: 16px, weight 600
  numbers: tabular-nums
rounded:
  card: 16px
  control: 10–12px
  pill: 9999px
spacing:
  base: 4px
  card_padding: 20px
  section_gap: 24px
---

# Design System: Hoyos Baker Client Portal

## 1. Overview

A restrained, light-first fintech interface for business owners and their accounting firm. One typeface (Inter), one accent (brand blue), tinted neutrals, white cards on a cool off-white page. Dark mode keeps the blue and moves the neutrals to navy. Reference: `INITIAL_PROMPT.md` §6; tokens in `app/globals.css`.

## 2. Colors

### Primary

The blue is split by role, as `../brand/DESIGN-TOKENS.md` asks, into three utilities:

- **`brand`**: the identity blue `#2D6CFF`, for everything that is not text: focus rings, hover borders, checkboxes, icon-only buttons (Nick's send), progress fills.
- **`blue`**: the solid action fill that carries a white label (Download Reports, Save changes), `#2563EB`, hover **`blue-hover`** `#1D4ED8`. It stays `#2563EB` rather than the identity blue because white on `#2D6CFF` measures 4.47:1 and AA asks 4.5 for any label below 18.66px bold; 15px semibold is not large text.
- **`link`**: the blue that *is* text (links, the current nav item, chips). `#2563EB` in light, `#60A5FA` in dark (hover `#1D4ED8` / `#93C5FD`). Until 2026-10-19 the dark theme reused `#2563EB` for text, which measures 3.34:1 on a dark card.

Soft `#EEF5FF` (`blue-pale`) for icon squares, chips, selected rows and the current nav item; `#142B55` in dark.

### Neutral

Page `#F7F9FC`, alternate surface `#F1F5F9`, cards `#FFFFFF`, borders `#E6ECF4` (soft `#EEF2F7`), headings `#0F172A`, muted text `#64748B`. Dark: page `#08111F`, card `#0F1B2D`, border `#26364D`, text `#E7EDF6`, muted `#9AABC1`.

### Semantic

Success `#10B981`, warning `#F59E0B`, danger `#EF4444`, info `#3B82F6`. Charts: blue `#2563EB`, teal `#0D9488`, purple `#7C3AED`, amber `#D97706`, pink `#DB2777` (dark: lighter variants).

### Named Rules

- Colour is contextual: revenue up is success, expenses or liabilities up is danger. Never colour alone; always with a sign, arrow or word.
- Status pills use a 10% tint of the semantic colour with the colour as text.
- Nothing is pure black or pure white text on the other; headings are slate `#0F172A`.

## 3. Typography

Inter everywhere. Product scale, tight ratio.

### Hierarchy

Ten steps, named by role and defined in `app/globals.css` `@theme` as `--text-*`, so a size is written `text-ui`, never `text-[14px]`. They set the size only; line-height stays with the element. `lib/utils/cn.ts` registers them with tailwind-merge, which would otherwise read `text-ui` as a colour and drop it.

| Token | Size | Role |
|---|---|---|
| `text-micro` | 11px | pills, overlines |
| `text-caption` | 12px | captions, axes, badges, "vs period" |
| `text-small` | 13px | secondary lines, figure labels, meta |
| `text-ui` | 14px | controls, nav, tables, list rows |
| `text-body` | 15px | reading text, ledes, inputs |
| `text-title` | 16px | card titles |
| `text-heading` | 18px | section headings, empty states, strip figures |
| `text-stat` | 22px | figures on a phone, secondary figures |
| `text-display` | 28px | page titles, headline figures from `sm` up |
| `text-hero` | 32px | Nick's greeting, the sign-in headline |

- Page title: `text-display` / 700 / tracking -0.02em, with a `text-body` muted lede under it.
- Card title: `text-title` / 600.
- Navigation items: `text-ui` / 400; the current item is 600 in the link blue on the soft pill.
- Figures: `text-stat` on a phone, `text-display` from `sm` / 700 / tabular.

### Named Rules

- Numbers are always `tabular-nums`.
- Weight carries hierarchy before size does; never below 12px.

## 4. Elevation

Flat by default. Cards: 1px border `#E6ECF4` plus `shadow-card`. Popovers and menus: `0 8px 24px rgba(15,23,42,0.12)`. Drawers and panels: `shadow-xl` with a 30–40% ink scrim. Dark mode elevates by lighter surface tone, not heavier shadow.

### Shadow Vocabulary

Utilities from `@theme`, each reading a navy-tinted variable that the dark theme deepens:

- `shadow-card`: `0 1px 2px`, ink 5%. Every card.
- `shadow-card-hover`: `0 8px 24px`, ink 7%. A card that is a link, on hover.
- `shadow-menu`: `0 8px 24px`, ink 12%. Popovers, menus, tooltips.
- `shadow-float` / `shadow-float-hover`: the floating Ask Nick trigger, the chart tooltip.
- `shadow-focus`: a 4px identity-blue halo on a focused input.
- `sheet` = Tailwind `shadow-xl`.

## 5. Components

### Buttons

Primary: blue fill, white text, 10–12px radius, 40–44px tall, `hover:bg-blue-soft`, 3px blue/40 focus ring. Secondary: card surface, 1px border, ink text. Danger: red text on red/10 hover. Icon buttons are 36–40px squares with the same focus ring.

### Chips

Citation and status chips: pill, 11.5–12px semibold, soft background with coloured text; citation chips carry a document icon and link to the source page.

### Page frame

Every client page is `PortalPage` (`components/portal/PortalPage.tsx`): the title and one line of context, then, when the page has any, one toolbar under them, with what filters the page (granularity, period, tax year, jurisdiction) on the left and what you take away (Export, Download Reports) on the right. The toolbar never sits beside the title: there, the same picker moved around with the title's width from page to page. Content is `max-w-[1200px]`, 16px gutters on a phone, 40px from `md`.

### Cards / Containers

`rounded-2xl border border-line bg-card p-5 shadow-card`. Never nested cards: a list inside a card is rows separated by hairlines (documents, reminders, tax topics), not tiles. Sections inside a card separate with space, not more borders. Rows of cards pair cards of like height (the Overview pairs reminders with documents and insights with the income tax), and the cards of a row stretch to one height.

### Figure cards

One anatomy for the Overview KPIs, the statement cards and the stat cards: the label on top, then, anchored to the foot so figures line up across a row even when a label wraps, the figure, the change pill and "vs period", with the sparkline bleeding into the corner from `sm` up. Two to a row on a phone (an odd last card takes the row), four from `xl`.

A statement page opens on **four** cards, the totals the owner reads first (P&L: revenue, gross profit, operating expenses, net income; Balance Sheet: assets, liabilities, equity, working capital), and puts the ratios and the cost line that explain them in one **strip** underneath (`MetricCards` `secondary`). Under the figures, one provenance line: basis, comparison, source, "Nothing is estimated."

A tax page leads with a **summary panel** (`SummaryPanel`): the amount still owed as the focal figure with the next due date beside it, and the figures that explain it (estimated, confirmed, paid, filings; collected, paid, taxable sales) in a hairline grid, not a wall of five or six equal cards.

### Disclosure

Long lists show what a glance holds and fold the rest: Insights show four and a "Show N more"; Help is an accordion with the first answer open. Native `<details>`, so it works without JavaScript and with the keyboard.

### Inputs / Fields

44px tall, 1px border, card background, 4px blue/12 focus halo (`focus:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]`), placeholder muted/60.

### Navigation

248px sidebar on `md+`, card surface with a faint brand-blue radial glow at the bottom, 1px right border. Under the logo, the business (its logo or initials and its name, or the switcher when the user has several), the way a workspace sits at the top of any tool. Items: outlined lucide icon (18px, stroke 1.75) + 14px/400 label, 10px radius; the current item is a **soft pill** (`blue-pale`, link-blue text, 600), not a solid one: where you are should be findable, not the loudest thing on screen. Hover is the secondary tint. Foot: Settings and Help & support, a hairline, then the user (avatar, name, role) as a menu. Top bar: breadcrumb (rooted at Overview), search (⌘K), notifications, theme toggle, help, account.

On a phone the top bar is a compact bar (menu, mark, bell, theme, Reports), the sidebar is a Radix drawer, and a **bottom tab bar** (`MobileTabBar`) carries the sections: Overview, Statements, Expenses, Taxes and Nick, each only when the firm sold it. It is 60px plus the safe area, published as `--tabbar-offset` so fixed and full-height content clears it.

### Nick (signature)

Nick is represented by the orb (`public/brand/nick-orb.png`, `components/chat/NickOrb.tsx`): a soft orange–pink gradient blob that breathes slowly at rest and quickens while Nick is thinking or answering, with a pulsing halo behind it; motion stops under reduced motion. It appears in the floating "Ask Nick" trigger (white pill, orb + label; on a phone the orb alone, riding above the tab bar), the panel header, beside every answer, and as the 116 px hero of an empty conversation. The full page opens on that hero: orb, a time-of-day greeting with the second line's accent in brand blue, the large composer, then four example cards; the conversation history is a sub-sidebar hidden by default and opened with the panel-left button. The contextual panel is a 480 px side sheet on desktop and full-screen on phones; assistant bubbles carry compact inline citation chips and a Sources row.

## 6. Do's and Don'ts

### Do:

- Put a source label or citation next to every figure.
- Use the same period selector, card and table on every page.
- Keep the sidebar and top bar identical across the client and firm portals.
- Design both themes together; test contrast in each.

### Don't:

- Gradient text, glass cards, side-stripe borders, hero-metric templates.
- A figure no statement prints, even when it is honest arithmetic: the Overview's "income minus operating expenses" headline read as a second profit beside Net Income and was removed (2026-10-19).
- Literal sizes and shadows (`text-[14px]`, `shadow-[…]`): use the scale and the shadow utilities.
- Colour as the only status signal.
- Placeholder buttons, fake charts or hard-coded figures.
- More than one accent colour on a screen.
