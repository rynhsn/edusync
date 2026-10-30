import { ROUTE, YARD } from './geometry';
import { idleLateCount, type PlannedEvent, planArrivals, routeTiming, yardSlots } from './logic';
import type { LiveEvent, Pt } from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Kecepatan jalan sosok (satuan peta per detik). */
const SPEED = 95;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Sosok anonim: bayangan, badan, kepala. Titik (0,0) ada di kaki. */
function makeFigure(variant: number, late: boolean): SVGGElement {
  const g = svg('g', { class: `sm-fig sm-fig-v${variant % 3}${late ? ' sm-fig-late' : ''}` });
  const inner = svg('g', { class: 'sm-bob' });
  inner.append(
    svg('ellipse', { class: 'sm-fig-shadow', cx: 0, cy: 0, rx: 5, ry: 2 }),
    svg('rect', { class: 'sm-fig-body', x: -3.2, y: -11, width: 6.4, height: 10.5, rx: 3 }),
    svg('circle', { class: 'sm-fig-head', cx: 0, cy: -14, r: 3.3 }),
  );
  g.append(inner);
  return g;
}

/**
 * Menggerakkan sosok di atas peta. Imperatif dan terisolasi dari React: elemen SVG dibuat langsung dan
 * dianimasikan dengan Web Animations API sehingga render React tidak terbebani. Semua timer dan animasi
 * dibersihkan di `destroy()`.
 */
export class FigureEngine {
  private moving = new Set<SVGGElement>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private idle: SVGGElement[] = [];
  private idleTimers = new Set<ReturnType<typeof setTimeout>>();
  private slots = yardSlots(YARD);
  private nextFreeAt = 0;
  private lateBudget = 0;
  private seq = 0;

  constructor(
    private readonly movingLayer: SVGGElement,
    private readonly idleLayer: SVGGElement,
  ) {}

  /** Sosok yang sedang berjalan ditambah yang menunggu giliran. */
  get load(): number {
    return this.moving.size + this.timers.size;
  }

  /** Tambah jatah sosok berwarna hangat untuk kedatangan berikutnya (dari selisih keterlambatan). */
  addLate(n: number) {
    this.lateBudget += n;
  }

  /** Atur sosok yang berdiri di halaman agar sesuai proporsi hadir. */
  setIdle(count: number, arrived: number, late: number) {
    const lateCount = idleLateCount(count, arrived, late);
    while (this.idle.length > count) {
      const el = this.idle.pop() as SVGGElement;
      el.setAttribute('data-in', 'false');
      const timer = setTimeout(() => {
        this.idleTimers.delete(timer);
        el.remove();
      }, 650);
      this.idleTimers.add(timer);
    }
    while (this.idle.length < count) {
      const i = this.idle.length;
      const [x, y] = this.slots[i % this.slots.length] as Pt;
      const el = makeFigure(i, false);
      el.classList.add('sm-idle');
      el.setAttribute('transform', `translate(${x} ${y})`);
      el.setAttribute('data-in', 'false');
      // Hanya sosok yang berdiri diam: matikan loncat kecil supaya hemat.
      el.firstElementChild?.setAttribute('class', '');
      this.idleLayer.append(el);
      requestAnimationFrame(() => el.setAttribute('data-in', 'true'));
      this.idle.push(el);
    }
    this.idle.forEach((el, i) => {
      el.classList.toggle('sm-fig-late', i < lateCount);
    });
  }

  /** Masukkan peristiwa baru ke antrean animasi (jeda 300-700 ms; kelebihan kapasitas diabaikan halus). */
  push(events: LiveEvent[]) {
    const now = performance.now();
    const plan = planArrivals(events, {
      nowMs: now,
      nextFreeAt: this.nextFreeAt,
      active: this.moving.size,
      pending: this.timers.size,
    });
    this.nextFreeAt = plan.nextFreeAt;
    for (const item of plan.items) this.schedule(item, now);
  }

  private schedule(item: PlannedEvent, now: number) {
    const timer = setTimeout(
      () => {
        this.timers.delete(timer);
        this.spawn(item.event);
      },
      Math.max(0, item.startAt - now),
    );
    this.timers.add(timer);
  }

  private spawn(event: LiveEvent) {
    const arrival = event.kind === 'arrival';
    const late = arrival && this.lateBudget > 0;
    if (late) this.lateBudget--;
    const el = makeFigure(this.seq++, late);
    el.style.opacity = '0';
    this.movingLayer.append(el);
    this.moving.add(el);

    // Sedikit simpangan agar sosok tidak berbaris persis di satu garis.
    const jx = (Math.random() - 0.5) * 12;
    const jy = (Math.random() - 0.5) * 6;
    const j = (p: Pt): Pt => [p[0] + jx, p[1] + jy];
    const inbound: Pt[] = [ROUTE.spawn, j(ROUTE.road), j(ROUTE.gate), j(ROUTE.plaza), j(ROUTE.door)];
    const route = arrival ? inbound : [...inbound].reverse();
    const { offsets, duration } = routeTiming(route, SPEED * (0.9 + Math.random() * 0.25));
    const frames: Keyframe[] = route.map((p, i) => ({
      transform: `translate(${p[0]}px, ${p[1]}px)`,
      offset: offsets[i],
      opacity: i === 0 || i === route.length - 1 ? 0 : 1,
    }));
    // Muncul dan lenyap di ujung rute, bukan mendadak.
    frames.splice(1, 0, {
      transform: frames[0]?.transform as string,
      offset: Math.min(0.04, (offsets[1] ?? 0.5) / 2),
      opacity: 1,
    });
    frames.splice(frames.length - 1, 0, {
      transform: frames[frames.length - 1]?.transform as string,
      offset: 0.96,
      opacity: 1,
    });
    // Titik sisipan harus tetap berurutan: pada rute pendek offset dipaksa naik.
    for (let i = 1; i < frames.length; i++) {
      const prev = frames[i - 1]?.offset as number;
      if ((frames[i]?.offset as number) < prev) (frames[i] as Keyframe).offset = prev;
    }
    const anim = el.animate(frames, {
      duration: Math.max(1500, duration),
      easing: 'linear',
      fill: 'forwards',
    });
    const done = () => {
      this.moving.delete(el);
      el.remove();
    };
    anim.onfinish = done;
    anim.oncancel = done;
  }

  /** Hentikan dan buang semua sosok yang berjalan serta antrean (mis. tab tersembunyi). */
  clearMoving() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const el of this.moving) {
      for (const a of el.getAnimations()) a.cancel();
      el.remove();
    }
    this.moving.clear();
    this.nextFreeAt = 0;
  }

  destroy() {
    this.clearMoving();
    for (const t of this.idleTimers) clearTimeout(t);
    this.idleTimers.clear();
    this.idleLayer.replaceChildren();
    this.idle = [];
  }
}
