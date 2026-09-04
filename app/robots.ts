import type { MetadataRoute } from 'next';

// A private client portal: nothing here is for search engines, and an indexed
// sign-in page only invites credential stuffing. Excluded from the middleware
// matcher so it is served as-is rather than locale-rewritten.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', disallow: '/' }] };
}
