import { describe, expect, it } from 'vitest';

import { ADMIN_NAV_ITEMS } from '@/lib/admin-nav';
import { isActiveNav } from '@/lib/nav';

describe('ADMIN_NAV_ITEMS', () => {
  it('only links to routes that exist — everything else is disabled, never a dead link', () => {
    const live = ADMIN_NAV_ITEMS.filter((i) => !i.disabled).map((i) => i.href);
    expect(live).toEqual(['/admin']);
  });

  it('the dashboard item is exact so it does not light up on every admin sub-route', () => {
    const dashboard = ADMIN_NAV_ITEMS.find((i) => i.href === '/admin')!;
    expect(dashboard.exact).toBe(true);
    expect(isActiveNav('/admin', dashboard.href, dashboard.exact)).toBe(true);
    expect(isActiveNav('/admin/clients', dashboard.href, dashboard.exact)).toBe(false);
  });
});
