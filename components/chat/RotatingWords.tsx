// The blue half of Nick's hero question: the words a client comes to ask about,
// cycling one at a time. Pure CSS (`.nick-rotator` in globals.css), so there is
// no timer to hydrate, nothing to mismatch between server and browser, and
// `prefers-reduced-motion` settles on the first word.
//
// Only the first word is left in the accessibility tree: a heading whose name
// changed every two seconds would be re-announced over and over, and "How are
// my sales?" is a whole sentence on its own.
export function RotatingWords({ words }: { words: string[] }) {
  return (
    <span className="nick-rotator text-blue">
      {words.map((word, index) => (
        <span
          key={word}
          className="nick-rotator__word"
          style={{ animationDelay: `${index * 2}s` }}
          {...(index === 0 ? {} : { 'aria-hidden': true })}
        >
          {word}
        </span>
      ))}
    </span>
  );
}
