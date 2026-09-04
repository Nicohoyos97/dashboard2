// The avatar file is uploaded client-side straight to Storage, and the Server
// Action is then handed the resulting URL. That makes the URL client-supplied
// even though the upload itself is policed by the bucket policy: `z.string().url()`
// alone would let a member store any address, which is then rendered with
// `<img src>` for every other member of the business — a tracking pixel that
// collects their IP and user agent whenever they open the members page.
//
// So the action re-derives what the uploader should have produced and compares.
// Mirrors the `avatars_owner_insert` policy: first path segment is the owner.

/** The public URL shape `getPublicUrl()` returns for the avatars bucket. */
function publicAvatarPrefix(projectUrl: string): string {
  return `${projectUrl.replace(/\/+$/, '')}/storage/v1/object/public/avatars/`;
}

/**
 * True when `url` is the public URL of an object inside the caller's own folder
 * of this project's avatars bucket. Everything else — another host, another
 * bucket, a signed path, someone else's folder — is refused.
 */
export function isOwnAvatarUrl(url: string, userId: string, projectUrl: string): boolean {
  const prefix = publicAvatarPrefix(projectUrl);
  if (!url.startsWith(prefix)) return false;
  const objectPath = url.slice(prefix.length);
  // A traversal segment would resolve back out of the owner's folder.
  if (objectPath.split('/').includes('..')) return false;
  return objectPath.startsWith(`${userId}/`) && objectPath.length > userId.length + 1;
}
