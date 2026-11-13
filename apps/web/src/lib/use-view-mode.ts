import { useEffect, useState } from 'react';

export type ViewMode = 'list' | 'card';

function readView(storageKey: string): ViewMode {
  try {
    return localStorage.getItem(storageKey) === 'card' ? 'card' : 'list';
  } catch {
    return 'list';
  }
}

export function useViewMode(storageKey: string) {
  const [view, setView] = useState<ViewMode>(() => readView(storageKey));

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, view);
    } catch {
      // Storage can be unavailable in private mode; the layout still works.
    }
  }, [storageKey, view]);

  return [view, setView] as const;
}
