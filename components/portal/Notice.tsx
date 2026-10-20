// One sentence above a page's figures that says why they cover what they
// cover: a range cut to the published days, or one that could not be added
// up at all. Its own module, so a page that only needs this does not import a
// statement page's client components with it.
export function Notice({ text }: { text: string }) {
  return <p className="border-warning/30 bg-warning/10 text-ink mt-6 rounded-xl border px-4 py-3 text-small">{text}</p>;
}
