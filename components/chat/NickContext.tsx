'use client';

// Shares the statement selection with the contextual panel: the table sets
// the selected line, the drawer can open Nick on it, the panel sends its id
// as a pointer the server re-validates against published rows. Without a
// provider the hook returns null, so the table works on pages without Nick.
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type NickLine = { id: string; name: string };

export type NickSelection = {
  line: NickLine | null;
  isOpen: boolean;
  setLine: (line: NickLine | null) => void;
  open: (line?: NickLine | null) => void;
  close: () => void;
};

const Ctx = createContext<NickSelection | null>(null);

export function NickProvider({ children }: { children: React.ReactNode }) {
  const [line, setLine] = useState<NickLine | null>(null);
  const [isOpen, setOpen] = useState(false);
  const open = useCallback((next?: NickLine | null) => {
    if (next !== undefined) setLine(next);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo<NickSelection>(
    () => ({ line, isOpen, setLine, open, close }),
    [line, isOpen, open, close],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNickSelection(): NickSelection | null {
  return useContext(Ctx);
}
