// Joins class names without resolving Tailwind conflicts: clsx alone.
//
// For a component that only ever joins a base with a variant sharing no
// utility with it. cn() runs tailwind-merge (~9 kB gzipped, configured at
// module load in ./cn, so a bundler cannot drop it) and is for when one class
// has to override another. Kept in its own module so that importing this one
// never brings that one along.
export { clsx as cx } from 'clsx';
