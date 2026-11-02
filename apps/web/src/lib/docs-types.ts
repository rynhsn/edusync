export type DocLocale = 'id' | 'en' | 'su';
export type DocIcon =
  | 'rocket'
  | 'users'
  | 'scan'
  | 'graduation'
  | 'wallet'
  | 'clipboard'
  | 'message'
  | 'shield'
  | 'credit'
  | 'lock'
  | 'building'
  | 'package'
  | 'history'
  | 'globe'
  | 'file'
  | 'megaphone'
  | 'briefcase'
  | 'trophy'
  | 'calendar'
  | 'book'
  | 'settings'
  | 'send'
  | 'layers'
  | 'school';
export type DocTone = 'teal' | 'sky' | 'violet' | 'amber' | 'rose' | 'emerald' | 'slate';
export interface DocSection {
  heading: string;
  body: string;
  steps?: string[];
  /** Alamat halaman terkait di aplikasi yang sama (mis. `/students`); tampil sebagai tombol "Buka halaman". */
  href?: string;
}
export interface DocText {
  title: string;
  summary: string;
  sections: DocSection[];
}
export interface DocArticle {
  slug: string;
  icon: DocIcon;
  tone: DocTone;
  /** Kunci modul (mis. `attendance`); bila sekolah belum memilikinya, artikel diberi tanda "modul belum aktif". */
  module?: string;
  text: Record<DocLocale, DocText>;
}
