---
name: Hoyos Baker Client Portal
description: Visual system of the client and firm portals. Tokens live in app/globals.css (@theme); this file is the human description of them.
colors:
  primary: "#2563EB"
  primary_hover: "#1D4ED8"
  primary_soft: "#EEF5FF"
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
  body: 14.5px / 1.55, weight 400
  label: 13.5px, weight 500
  nav: 14px, weight 400
  heading_page: 28px, weight 700, tracking -0.01em
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

Brand blue `#2563EB` for primary actions, the active navigation item, links and interactive figures; hover `#1D4ED8`; soft `#EEF5FF` for icon squares, chips and selected rows. In dark mode the soft tone becomes `#142B55`.

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

- Page title: 28px / 700 / tracking -0.01em, with a 15px muted lede under it.
- Card title: 16px / 600. Section label: 11–12px / 600 / uppercase / tracking 0.08–0.12em / muted.
- Body and chat: 14.5px / 1.55 / 400. Table cells: 13.5px, tabular numerals.
- Navigation items: 14px / 400; the active item stays 400 and gets the filled pill.
- KPI value: 24–28px / 700 / tabular.

### Named Rules

- Numbers are always `tabular-nums`.
- Weight carries hierarchy before size does; never below 12px.

## 4. Elevation

Flat by default. Cards: 1px border `#E6ECF4` plus `0 1px 2px rgba(15,23,42,0.04)`. Popovers and menus: `0 8px 24px rgba(15,23,42,0.12)`. Drawers and panels: `shadow-xl` with a 30–40% ink scrim. Dark mode elevates by lighter surface tone, not heavier shadow.

### Shadow Vocabulary

- `card` = `0 1px 2px rgba(15,23,42,0.04)`
- `menu` = `0 8px 24px rgba(15,23,42,0.12)`
- `sheet` = Tailwind `shadow-xl`

## 5. Components

### Buttons

Primary: blue fill, white text, 10–12px radius, 40–44px tall, `hover:bg-blue-soft`, 3px blue/40 focus ring. Secondary: card surface, 1px border, ink text. Danger: red text on red/10 hover. Icon buttons are 36–40px squares with the same focus ring.

### Chips

Citation and status chips: pill, 11.5–12px semibold, soft background with coloured text; citation chips carry a document icon and link to the source page.

### Cards / Containers

`rounded-2xl border border-line bg-card p-5 shadow-card`. Never nested cards. Sections inside a card separate with 24px gaps, not more borders.

### Inputs / Fields

44px tall, 1px border, card background, 4px blue/12 focus halo (`focus:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]`), placeholder muted/60.

### Navigation

248px sidebar on `md+`, card surface with a faint brand-blue radial glow at the bottom, 1px right border. Items: outlined lucide icon (18px, stroke 1.75) + 14px/400 label, 10px radius; active item is a filled blue pill with white text; hover is the secondary tint. Bottom block: hairline divider, then the user (avatar, name, role) and the utility links (Settings, Help & support). Top bar: search (⌘K), theme toggle, help. On mobile the sidebar is a Radix drawer and the top bar shows the hamburger and brand.

### Nick (signature)

Nick is represented by the orb (`public/brand/nick-orb.png`, `components/chat/NickOrb.tsx`): a soft orange–pink gradient blob that breathes slowly at rest and quickens while Nick is thinking or answering, with a pulsing halo behind it; motion stops under reduced motion. It appears in the floating "Ask Nick" trigger (white pill, orb + label), the panel header, beside every answer, and as the 116 px hero of an empty conversation. The full page opens on that hero: orb, a time-of-day greeting with the second line's accent in brand blue, the large composer, then four example cards; the conversation history is a sub-sidebar hidden by default and opened with the panel-left button. The contextual panel is a 480 px side sheet on desktop and full-screen on phones; assistant bubbles carry compact inline citation chips and a Sources row.

## 6. Do's and Don'ts

### Do:

- Put a source label or citation next to every figure.
- Use the same period selector, card and table on every page.
- Keep the sidebar and top bar identical across the client and firm portals.
- Design both themes together; test contrast in each.

### Don't:

- Gradient text, glass cards, side-stripe borders, hero-metric templates.
- Colour as the only status signal.
- Placeholder buttons, fake charts or hard-coded figures.
- More than one accent colour on a screen.
