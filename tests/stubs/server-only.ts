// Vitest stand-in for the `server-only` package: the real module throws when
// imported outside a React Server Component bundle, which is exactly where
// node-side tests run. The guard is a build-time concern, not a test concern.
export {};
