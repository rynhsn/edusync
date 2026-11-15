/** Cache LRU kecil untuk isi lampiran (kunci attachment_id) agar siaran 200 penerima tidak membaca 2 MB x 200 dari DB. */
export class AttachmentCache {
  private readonly map = new Map<string, Buffer>();
  private bytes = 0;

  constructor(private readonly maxBytes = 20 * 1024 * 1024) {}

  get(id: string): Buffer | undefined {
    const hit = this.map.get(id);
    if (hit) {
      this.map.delete(id); // segarkan urutan: yang terlama dibuang lebih dulu
      this.map.set(id, hit);
    }
    return hit;
  }

  set(id: string, data: Buffer) {
    this.delete(id);
    if (data.length > this.maxBytes) return;
    this.map.set(id, data);
    this.bytes += data.length;
    for (const [k, v] of this.map) {
      if (this.bytes <= this.maxBytes) break;
      this.map.delete(k);
      this.bytes -= v.length;
    }
  }

  delete(id: string) {
    const hit = this.map.get(id);
    if (hit) {
      this.map.delete(id);
      this.bytes -= hit.length;
    }
  }

  get size() {
    return this.map.size;
  }
}
