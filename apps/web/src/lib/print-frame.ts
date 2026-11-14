/**
 * Cetak dokumen HTML mandiri lewat iframe tersembunyi (tanpa jendela baru yang dapat diblokir). Pengguna dapat memilih
 * "Simpan sebagai PDF" di dialog cetak peramban. Dipakai SKL dan transkrip kelulusan.
 */
export function printHtml(html: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  frame.srcdoc = html;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  document.body.appendChild(frame);
}
