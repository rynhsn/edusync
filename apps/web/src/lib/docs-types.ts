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
/** Kelompok artikel di halaman daftar; nama tampilnya ada di namespace i18n `docs.groups`. */
export type DocGroup =
  | 'master'
  | 'attendance'
  | 'academic'
  | 'finance'
  | 'services'
  | 'access'
  | 'ops'
  | 'config'
  | 'watch';
export interface DocSection {
  heading: string;
  body: string;
  steps?: string[];
  /** Alamat halaman terkait di aplikasi yang sama (mis. `/students`); tampil sebagai tombol "Buka halaman". */
  href?: string;
  /** Saran singkat yang memudahkan pekerjaan; tampil sebagai kotak tips. */
  tip?: string;
  /** Hal yang bisa membuat salah atau tidak bisa dibatalkan; tampil sebagai kotak perhatian. */
  warning?: string;
}
export interface DocFaq {
  q: string;
  a: string;
}
export interface DocText {
  title: string;
  summary: string;
  /** Siapa yang biasanya memakai fitur ini, dalam bahasa sehari-hari (mis. "Admin sekolah dan operator TU"). */
  forWho?: string;
  sections: DocSection[];
  /** Pertanyaan yang sering muncul beserta jawabannya. */
  faq?: DocFaq[];
}
export interface DocArticle {
  slug: string;
  icon: DocIcon;
  tone: DocTone;
  group?: DocGroup;
  /** Kunci modul (mis. `attendance`); bila sekolah belum memilikinya, artikel diberi tanda "modul belum aktif". */
  module?: string;
  text: Record<DocLocale, DocText>;
}
