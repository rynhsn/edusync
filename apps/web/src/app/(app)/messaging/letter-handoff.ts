/**
 * Serah-terima dari halaman surat ke tab "Pesan langsung": lampiran PDF surat yang sudah diunggah dan murid
 * terkait, lewat sessionStorage (satu tab, sekali pakai). Tanpa berkas: hanya metadata lampiran.
 */
const KEY = 'edusync.messaging.letterHandoff';

export interface LetterHandoff {
  attachment: { id: string; fileName: string; mime: string; size: number };
  student: { id: string; label: string } | null;
  body: string;
}

export function saveLetterHandoff(h: LetterHandoff): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(h));
  } catch {
    // Penyimpanan diblokir: pesan tetap bisa disusun manual dengan memilih lampiran lagi.
  }
}

export function hasLetterHandoff(): boolean {
  try {
    return sessionStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

/** Ambil lalu hapus; null bila tidak ada atau isinya tidak sesuai bentuk. */
export function takeLetterHandoff(): LetterHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const h = JSON.parse(raw) as Partial<LetterHandoff>;
    const a = h.attachment;
    if (!a || typeof a.id !== 'string' || typeof a.fileName !== 'string' || typeof a.size !== 'number') {
      return null;
    }
    return {
      attachment: { id: a.id, fileName: a.fileName, mime: String(a.mime), size: a.size },
      student: h.student && typeof h.student.id === 'string' ? h.student : null,
      body: typeof h.body === 'string' ? h.body : '',
    };
  } catch {
    return null;
  }
}
