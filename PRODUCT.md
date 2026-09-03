# Product

## Register

product

## Users

Two audiences, one firm.

- **Business owners** (clients of Hoyos Baker) with no accounting background. They open the portal a few times a month, usually after the accountant publishes a statement, on a laptop at the office or a phone between jobs. Job to be done: "How is my business doing, what changed, what do I owe and when?" without having to call the accountant.
- **The firm's master admin** (an accountant) who uses the admin portal daily as a work queue: upload documents, correct extractions, reconcile, publish, manage clients.

Both are in a task. Nobody browses this product for pleasure.

## Product Purpose

A client portal plus a firm admin portal for an accounting firm: interactive Profit & Loss and Balance Sheet statements, cash from published bank statements, expenses, income and sales tax status, reminders, original-document downloads, and Nick, an AI assistant that only answers from published figures and cites every number.

Success looks like: an owner reads their numbers and understands them without a phone call, trusts every figure because it traces back to a published page, and the firm is comfortable putting its name on every screen. Source: `INITIAL_PROMPT.md` §2, §6, §10.

## Brand Personality

Trustworthy, calm, plain-spoken. Premium-fintech restraint: simple for an owner, detailed enough to be useful, serious enough for a firm. Friendly financial language, explained the first time it appears; never jargon-first, never salesy.

## Anti-references

- Consumer budgeting apps: confetti, streaks, gradients on everything, playful mascots.
- Enterprise ERP density: gray-on-gray tables, stacked toolbars, ten shades of the same gray.
- Dashboards where colour alone conveys status, or where a number appears without a source.
- Generic "AI SaaS": glass cards, gradient text, sparkle-covered hero metrics, chat bubbles that invent figures.

## Design Principles

- **Every figure has a source.** Nothing on screen is an estimate unless it says so. Source labels, citation chips and "how is this calculated" belong to the interface, not to a footnote.
- **Earned familiarity.** Standard sidebar plus top bar, predictable cards, one component vocabulary (shadcn + Radix + lucide). The tool disappears into the task.
- **One accent, used for meaning.** Brand blue marks the primary action, the current place and interactive figures. Contextual colour (revenue up is good, expenses up is not) is always paired with a sign, an icon or a word.
- **Calm density.** Dense where the owner is working (statements, tables), airy where they are orienting (overview, chat, help).
- **Bilingual by default.** Every string exists in English and Spanish; layouts are built for the longer of the two.

## Accessibility & Inclusion

WCAG 2.1 AA. Text contrast 4.5:1 in both themes, visible focus rings everywhere, keyboard-operable tables, drawers and dialogs, a text summary for every chart, status never conveyed by colour alone, `prefers-reduced-motion` respected, 44 px touch targets on phones. Client users may be older, non-technical and on small screens; the firm admin may work for hours at a time.
