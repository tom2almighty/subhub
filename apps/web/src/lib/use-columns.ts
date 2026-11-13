import { useEffect, useState } from 'react';

export type ColumnCount = 1 | 2 | 3;

const VALUES: ColumnCount[] = [1, 2, 3];

function readColumns(storageKey: string, fallback: ColumnCount): ColumnCount {
  try {
    const raw = Number(localStorage.getItem(storageKey));
    return VALUES.includes(raw as ColumnCount) ? (raw as ColumnCount) : fallback;
  } catch {
    return fallback;
  }
}

export function useColumnCount(storageKey: string, fallback: ColumnCount = 1) {
  const [columns, setColumns] = useState<ColumnCount>(() => readColumns(storageKey, fallback));

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(columns));
    } catch {
      // Storage can be unavailable in private mode; the layout still works.
    }
  }, [columns, storageKey]);

  return [columns, setColumns] as const;
}

export function columnGridClass(columns: ColumnCount): string {
  if (columns === 2) return 'grid-cols-1 sm:grid-cols-2';
  if (columns === 3) return 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3';
  return 'grid-cols-1';
}
