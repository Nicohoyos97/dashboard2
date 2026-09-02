// Locale-aware navigation helpers. Use these instead of next/link and
// next/navigation in localized routes so the active locale prefix (/es) is
// applied automatically.
import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
