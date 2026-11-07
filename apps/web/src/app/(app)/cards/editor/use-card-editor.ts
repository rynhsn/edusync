'use client';

import type { CardElement, CardLayout } from '@edusync/contracts';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  breakKey,
  canRedo,
  canUndo,
  commitFrom,
  createHistory,
  type History,
  redo,
  replacePresent,
  setPresent,
  undo,
} from '@/lib/cards/history';

/** Isi yang diedit: nama, tata letak, dan latar. Seluruhnya dibandingkan untuk mendeteksi perubahan belum tersimpan. */
export interface EditorDoc {
  name: string;
  layout: CardLayout;
  backgroundFileId: string | null;
  isDefault: boolean;
}

/** Riwayat undo/redo + pilihan elemen untuk editor kartu. */
export function useCardEditor(initial: EditorDoc) {
  const [history, setHistory] = useState<History<EditorDoc>>(() => createHistory(initial));
  const [baseline, setBaseline] = useState<string>(() => JSON.stringify(initial));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Keadaan terbaru untuk penangan peristiwa jendela (seret) yang dibuat sekali.
  const docRef = useRef(history.present);
  docRef.current = history.present;

  const doc = history.present;

  /** Ubah dokumen sebagai satu langkah undo. Perubahan beruntun dengan `key` sama digabung. */
  const change = useCallback((fn: (d: EditorDoc) => EditorDoc, key: string | null = null) => {
    setHistory((h) => setPresent(h, fn(h.present), key));
  }, []);

  /** Ubah tanpa langkah undo (selama menyeret); akhiri dengan `commit(base)`. */
  const transient = useCallback((fn: (d: EditorDoc) => EditorDoc) => {
    setHistory((h) => replacePresent(h, fn(h.present)));
  }, []);

  const commit = useCallback((base: EditorDoc) => setHistory((h) => commitFrom(h, base)), []);

  const changeLayout = useCallback(
    (fn: (l: CardLayout) => CardLayout, key: string | null = null) =>
      change((d) => ({ ...d, layout: fn(d.layout) }), key),
    [change],
  );

  const changeElement = useCallback(
    (id: string, patch: Partial<CardElement>, key: string | null = null) =>
      changeLayout(
        (l) => ({
          ...l,
          elements: l.elements.map((el) => (el.id === id ? ({ ...el, ...patch } as CardElement) : el)),
        }),
        key,
      ),
    [changeLayout],
  );

  /** Setelah simpan berhasil: dokumen tersimpan menjadi acuan perubahan, riwayat dimulai ulang. */
  const markSaved = useCallback((saved: EditorDoc) => {
    setHistory(createHistory(saved));
    setBaseline(JSON.stringify(saved));
  }, []);

  const dirty = useMemo(() => JSON.stringify(doc) !== baseline, [doc, baseline]);
  const selected = doc.layout.elements.find((el) => el.id === selectedId) ?? null;

  return {
    doc,
    docRef,
    selectedId: selected ? selectedId : null,
    selected,
    select: setSelectedId,
    change,
    transient,
    commit,
    changeLayout,
    changeElement,
    markSaved,
    dirty,
    undo: useCallback(() => setHistory((h) => undo(h)), []),
    redo: useCallback(() => setHistory((h) => redo(h)), []),
    endTyping: useCallback(() => setHistory((h) => breakKey(h)), []),
    canUndo: canUndo(history),
    canRedo: canRedo(history),
  };
}

export type CardEditor = ReturnType<typeof useCardEditor>;
