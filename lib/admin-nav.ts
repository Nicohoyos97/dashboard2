// Firm portal navigation (INITIAL_PROMPT.md §8). Items flip from `disabled` to
// live as each page ships in Phase 2; disabled ones render non-interactive. Labels resolve in the `Admin` i18n namespace.
import type { NavItem } from './nav';

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: '/admin', labelKey: 'navDashboard', exact: true },
  { href: '/admin/clients', labelKey: 'navClients' },
  { href: '/admin/upload', labelKey: 'navUpload', disabled: true },
  { href: '/admin/documents', labelKey: 'navDocuments' },
  { href: '/admin/audit', labelKey: 'navAudit' },
];
