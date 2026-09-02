// Firm portal navigation (INITIAL_PROMPT.md §8). Only the dashboard is live in
// Phase 1; the rest ships with the ingestion pipeline (Phase 2) and renders
// non-interactive until then. Labels resolve in the `Admin` i18n namespace.
import type { NavItem } from './nav';

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: '/admin', labelKey: 'navDashboard', exact: true },
  { href: '/admin/clients', labelKey: 'navClients', disabled: true },
  { href: '/admin/upload', labelKey: 'navUpload', disabled: true },
  { href: '/admin/documents', labelKey: 'navDocuments', disabled: true },
  { href: '/admin/audit', labelKey: 'navAudit', disabled: true },
];
