// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { isOwnAvatarUrl } from '@/lib/settings/avatar';

const PROJECT = 'https://cybumdnyfuuqynqofwsi.supabase.co';
const USER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const own = `${PROJECT}/storage/v1/object/public/avatars/${USER}/1757000000000.png`;

describe('isOwnAvatarUrl', () => {
  it('accepts the URL the uploader produces for the caller’s own folder', () => {
    expect(isOwnAvatarUrl(own, USER, PROJECT)).toBe(true);
  });

  it('refuses a URL outside the project', () => {
    // avatar_url is rendered with <img src> for every other member of the
    // business, so an arbitrary host turns the members page into a tracking
    // pixel that collects their IP and user agent.
    expect(isOwnAvatarUrl('https://attacker.example/px.gif', USER, PROJECT)).toBe(false);
    expect(
      isOwnAvatarUrl(`https://attacker.example/storage/v1/object/public/avatars/${USER}/a.png`, USER, PROJECT),
    ).toBe(false);
  });

  it('refuses another bucket or a private object path', () => {
    expect(
      isOwnAvatarUrl(`${PROJECT}/storage/v1/object/public/documents/${USER}/a.pdf`, USER, PROJECT),
    ).toBe(false);
    expect(
      isOwnAvatarUrl(`${PROJECT}/storage/v1/object/sign/avatars/${USER}/a.png`, USER, PROJECT),
    ).toBe(false);
  });

  it('refuses another member’s folder, matching the bucket write policy', () => {
    expect(isOwnAvatarUrl(own.replace(USER, OTHER), USER, PROJECT)).toBe(false);
  });

  it('refuses a traversal back out of the caller’s folder', () => {
    expect(
      isOwnAvatarUrl(`${PROJECT}/storage/v1/object/public/avatars/${USER}/../${OTHER}/a.png`, USER, PROJECT),
    ).toBe(false);
  });

  it('refuses a prefix that only looks like the project origin', () => {
    expect(
      isOwnAvatarUrl(`${PROJECT}.attacker.example/storage/v1/object/public/avatars/${USER}/a.png`, USER, PROJECT),
    ).toBe(false);
  });

  it('refuses anything that is not a URL', () => {
    expect(isOwnAvatarUrl('not a url', USER, PROJECT)).toBe(false);
    expect(isOwnAvatarUrl('', USER, PROJECT)).toBe(false);
  });
});
