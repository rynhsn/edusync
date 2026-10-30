'use client';

import { memo } from 'react';
import { CLASS_BLDG, FIELD, iso, OFFICE_BLDG, ROUTE, STAFF_BLDG, U, VIEW_H, VIEW_W } from './geometry';
import { celestial, seededRandom } from './logic';
import type { BuildingKind, Pt } from './types';

/** Ilustrasi isometrik datar sekolah. Murni tampilan: semua data masuk lewat props, tidak ada fetch di sini. */

const pts = (list: readonly Pt[]) => list.map((p) => `${p[0]},${p[1]}`).join(' ');

type Tone = 'wall' | 'roofA' | 'roofB' | 'roofC' | 'red';
const toneVar = (tone: Tone, face: 't' | 'l' | 'r') => `var(--sm-${tone}-${face})`;

/** Balok isometrik dengan tiga nada: atas, kiri (sisi panjang), kanan. `z` mengangkat alasnya. */
function Box({
  x,
  y,
  z = 0,
  a,
  b,
  h,
  tone,
}: {
  x: number;
  y: number;
  z?: number;
  a: number;
  b: number;
  h: number;
  tone: Tone;
}) {
  const P = (aa: number, bb: number, hh: number) => iso(x, y - z, aa, bb, hh);
  return (
    <g>
      <polygon points={pts([P(0, b, 0), P(a, b, 0), P(a, b, h), P(0, b, h)])} fill={toneVar(tone, 'l')} />
      <polygon points={pts([P(a, b, 0), P(a, 0, 0), P(a, 0, h), P(a, b, h)])} fill={toneVar(tone, 'r')} />
      <polygon points={pts([P(0, 0, h), P(a, 0, h), P(a, b, h), P(0, b, h)])} fill={toneVar(tone, 't')} />
    </g>
  );
}

/** Bangunan berdinding krem dengan lempeng atap yang sedikit menjorok. */
function Building({
  x,
  y,
  a,
  b,
  h,
  roof,
}: {
  x: number;
  y: number;
  a: number;
  b: number;
  h: number;
  roof: Tone;
}) {
  return (
    <g>
      <Box x={x} y={y} a={a} b={b} h={h} tone="wall" />
      <Box x={x} y={y - 0.8 * U} z={h} a={a + 0.8} b={b + 0.8} h={5} tone={roof} />
    </g>
  );
}

/** Jajaran genjang pada sisi kiri (sisi panjang) pada bidang b. */
const leftQuad = (x: number, y: number, b: number, a0: number, a1: number, z0: number, z1: number): Pt[] => [
  iso(x, y, a0, b, z0),
  iso(x, y, a1, b, z0),
  iso(x, y, a1, b, z1),
  iso(x, y, a0, b, z1),
];

/** Jajaran genjang pada sisi kanan (sisi pendek) pada bidang a. */
const rightQuad = (x: number, y: number, a: number, b0: number, b1: number, z0: number, z1: number): Pt[] => [
  iso(x, y, a, b1, z0),
  iso(x, y, a, b0, z0),
  iso(x, y, a, b0, z1),
  iso(x, y, a, b1, z1),
];

/** Jendela gedung kelas: 13 buah (7 di lantai atas, 6 di bawah karena pintu). */
export const CLASS_WINDOW_COUNT = 13;
/** Urutan menyala supaya jendela yang menyala tersebar, bukan menumpuk di satu sisi. */
const LIGHT_ORDER = [3, 9, 6, 0, 10, 12, 1, 7, 11, 5, 2, 8, 4];

function classWindows(): Pt[][] {
  const { x, y, b } = CLASS_BLDG;
  const out: Pt[][] = [];
  for (let i = 0; i < 7; i++) {
    const c = 0.9 + 1.3 * i;
    out.push(leftQuad(x, y, b, c - 0.4, c + 0.4, 36, 54));
  }
  for (let i = 0; i < 7; i++) {
    if (i === 3) continue;
    const c = 0.9 + 1.3 * i;
    out.push(leftQuad(x, y, b, c - 0.4, c + 0.4, 8, 26));
  }
  return out;
}

function Tree({ x, y, s = 1, delay = 0 }: { x: number; y: number; s?: number; delay?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx={3} cy={1} rx={15} ry={5} fill="var(--sm-shadow)" />
      <rect x={-2} y={-20} width={4} height={20} rx={1.5} fill="var(--sm-trunk)" />
      <g className="sm-sway" style={{ animationDelay: `${-delay}s` }}>
        <circle cx={3} cy={-32} r={14} fill="var(--sm-tree-d)" />
        <circle cx={-3} cy={-35} r={12} fill="var(--sm-tree-m)" />
        <circle cx={-5} cy={-39} r={7} fill="var(--sm-tree-l)" />
      </g>
    </g>
  );
}

function Cloud({ y, dur, delay, s = 1 }: { y: number; dur: number; delay: number; s?: number }) {
  return (
    <g className="sm-cloud" style={{ animationDuration: `${dur}s`, animationDelay: `${-delay}s` }}>
      <g transform={`translate(0 ${y}) scale(${s})`} fill="var(--sm-cloud)">
        <ellipse cx={0} cy={0} rx={34} ry={10} />
        <ellipse cx={-14} cy={-8} rx={16} ry={11} />
        <ellipse cx={10} cy={-11} rx={19} ry={13} />
      </g>
    </g>
  );
}

const STARS = (() => {
  const rand = seededRandom(3);
  return Array.from({ length: 26 }, () => ({
    x: Math.round(rand() * VIEW_W),
    y: Math.round(rand() * 150),
    r: 0.8 + rand() * 1.1,
    d: rand() * 3,
  }));
})();

/** Pagar: pita setinggi 13 satuan beserta tiangnya, mengikuti garis dari p0 ke p1. */
function Fence({ p0, p1 }: { p0: Pt; p1: Pt }) {
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const n = Math.max(2, Math.round(len / 10));
  let posts = '';
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const px = p0[0] + (p1[0] - p0[0]) * t;
    const py = p0[1] + (p1[1] - p0[1]) * t;
    posts += `M${px.toFixed(1)} ${py.toFixed(1)}v-13`;
  }
  return (
    <g strokeLinecap="round">
      <path d={posts} stroke="var(--sm-fence)" strokeWidth={2.2} fill="none" />
      <line
        x1={p0[0]}
        y1={p0[1] - 4}
        x2={p1[0]}
        y2={p1[1] - 4}
        stroke="var(--sm-fence-edge)"
        strokeWidth={1.6}
      />
      <line
        x1={p0[0]}
        y1={p0[1] - 11}
        x2={p1[0]}
        y2={p1[1] - 11}
        stroke="var(--sm-fence-edge)"
        strokeWidth={1.6}
      />
    </g>
  );
}

export interface SceneProps {
  /** Jam sekolah ("HH:MM") untuk posisi matahari/bulan. */
  time: string;
  /** Jumlah jendela gedung kelas yang menyala. */
  litClass: number;
  /** Jendela ruang guru dan TU menyala (malam hari, sekolah buka). */
  litStaff: boolean;
  ringing: boolean;
  active: Record<BuildingKind, boolean>;
}

/** Ilustrasi statis (kecuali awan, pohon, lonceng yang digerakkan CSS). Memo agar tidak digambar ulang. */
export const Scene = memo(function Scene({ time, litClass, litStaff, ringing, active }: SceneProps) {
  const sky = celestial(time);
  const bodyX = 80 + sky.progress * 800;
  const bodyY = 172 - Math.sin(Math.PI * sky.progress) * 125;

  const { x: cx, y: cy, a: ca, b: cb, h: ch } = CLASS_BLDG;
  const cWins = classWindows();
  const litSet = new Set(LIGHT_ORDER.slice(0, Math.min(litClass, CLASS_WINDOW_COUNT)));

  const sb = STAFF_BLDG;
  const staffWins: Pt[][] = [
    ...[1, 2.5, 4].map((c) => leftQuad(sb.x, sb.y, sb.b, c - 0.4, c + 0.4, 16, 34)),
    ...[1.2, 2.8].map((c) => rightQuad(sb.x, sb.y, sb.a, c - 0.4, c + 0.4, 16, 34)),
  ];
  const ob = OFFICE_BLDG;
  const officeWins: Pt[][] = [
    ...[1, 2.5, 4].map((c) => leftQuad(ob.x, ob.y, ob.b, c - 0.4, c + 0.4, 16, 34)),
    ...[1.2, 2.8].map((c) => rightQuad(ob.x, ob.y, ob.a, c - 0.4, c + 0.4, 16, 34)),
  ];
  const kiosk = { x: 400, y: 455, a: 2.5, b: 2, h: 30 };
  const kioskWin = leftQuad(kiosk.x, kiosk.y, kiosk.b, 0.5, 2, 12, 24);

  // Kubah lonceng di atap gedung kelas.
  const cupola = iso(cx, cy, 4.3, 1.3);
  const bellPos = iso(cx, cy, 5, 2.7, ch + 12);
  const door = leftQuad(cx, cy, cb, 4.2, 5.4, 0, 22);

  const fieldP = (a: number, b: number) => iso(FIELD.x, FIELD.y, a, b, 0);
  const field = [fieldP(0, 0), fieldP(FIELD.a, 0), fieldP(FIELD.a, FIELD.b), fieldP(0, FIELD.b)];
  const fieldIn = [
    fieldP(0.4, 0.4),
    fieldP(FIELD.a - 0.4, 0.4),
    fieldP(FIELD.a - 0.4, FIELD.b - 0.4),
    fieldP(0.4, FIELD.b - 0.4),
  ];
  const fieldMid = [fieldP(FIELD.a / 2, 0.4), fieldP(FIELD.a / 2, FIELD.b - 0.4)];
  const fieldCenter = fieldP(FIELD.a / 2, FIELD.b / 2);

  const { road, gate, plaza, door: doorPt, spawn } = ROUTE;
  const roadLine = `M${spawn[0] - 40} ${spawn[1] - 20} L${road[0] + 260} ${road[1] + 130}`;

  const hide = (k: BuildingKind) => (active[k] ? 'true' : 'false');

  return (
    <g>
      <defs>
        <linearGradient id="sm-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--sm-sky-top)" />
          <stop offset="1" stopColor="var(--sm-sky-bot)" />
        </linearGradient>
      </defs>

      {/* Langit dan benda langit */}
      <rect width={VIEW_W} height={210} fill="url(#sm-sky)" />
      <rect className="sm-sky-dim" width={VIEW_W} height={210} />
      <g className="sm-stars">
        {STARS.map((s) => (
          <circle
            key={`${s.x}-${s.y}`}
            className="sm-star"
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill="oklch(0.98 0.02 100)"
            style={{ animationDelay: `${-s.d}s` }}
          />
        ))}
      </g>
      {sky.body === 'sun' ? (
        <g>
          <circle cx={bodyX} cy={bodyY} r={34} fill="var(--sm-sun)" opacity={0.25} />
          <circle cx={bodyX} cy={bodyY} r={20} fill="var(--sm-sun)" />
        </g>
      ) : (
        <g>
          <circle cx={bodyX} cy={bodyY} r={24} fill="var(--sm-moon)" opacity={0.18} />
          <circle cx={bodyX} cy={bodyY} r={14} fill="var(--sm-moon)" />
          <circle cx={bodyX - 4} cy={bodyY - 3} r={2.4} fill="oklch(0.85 0.02 100)" />
          <circle cx={bodyX + 4} cy={bodyY + 4} r={1.8} fill="oklch(0.85 0.02 100)" />
        </g>
      )}
      <Cloud y={52} dur={120} delay={30} />
      <Cloud y={96} dur={165} delay={95} s={0.8} />
      <Cloud y={70} dur={140} delay={5} s={1.15} />

      {/* Bukit, tanah, jalan */}
      <path d="M0 205 Q100 150 230 178 T480 168 T740 176 T960 156 V215 H0Z" fill="var(--sm-hill-far)" />
      <path d="M0 215 Q140 176 300 198 T620 190 T960 186 V225 H0Z" fill="var(--sm-hill-near)" />
      <rect y={196} width={VIEW_W} height={VIEW_H - 196} fill="var(--sm-grass)" />
      <polygon points="470,300 640,385 560,425 390,340" fill="var(--sm-grass-2)" />
      <polygon points="40,255 150,310 90,340 -20,285" fill="var(--sm-grass-2)" />
      <polygon points="760,470 900,540 800,560 700,505" fill="var(--sm-grass-2)" />

      <path d={roadLine} stroke="var(--sm-road)" strokeWidth={36} fill="none" strokeLinecap="butt" />
      <path
        d={roadLine}
        stroke="var(--sm-road-line)"
        strokeWidth={2}
        strokeDasharray="14 12"
        fill="none"
        opacity={0.7}
      />

      <polygon
        points={pts([
          iso(plaza[0], plaza[1] - 4 * U, 0, 0),
          iso(plaza[0], plaza[1] - 4 * U, 4, 0),
          iso(plaza[0], plaza[1] - 4 * U, 4, 4),
          iso(plaza[0], plaza[1] - 4 * U, 0, 4),
        ])}
        fill="var(--sm-path)"
        stroke="var(--sm-path-edge)"
        strokeWidth={1.5}
      />
      <polyline
        points={pts([road, gate, plaza, doorPt])}
        fill="none"
        stroke="var(--sm-path-edge)"
        strokeWidth={26}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <polyline
        points={pts([road, gate, plaza, doorPt])}
        fill="none"
        stroke="var(--sm-path)"
        strokeWidth={22}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Pagar dengan gerbang */}
      <Fence p0={[100, 370]} p1={[gate[0] - 36, gate[1] - 18]} />
      <Fence p0={[gate[0] + 36, gate[1] + 18]} p1={[480, 560]} />

      {/* Gedung kelas */}
      <g className="sm-b sm-b-classes" data-active={hide('classes')}>
        <Building x={cx} y={cy} a={ca} b={cb} h={ch} roof="roofA" />
        <Box x={cupola[0]} y={cupola[1]} z={ch + 5} a={1.4} b={1.4} h={14} tone="wall" />
        <Box x={cupola[0]} y={cupola[1] - 0.6 * U} z={ch + 19} a={2} b={2} h={3} tone="roofA" />
        <polygon points={pts(door)} fill="var(--sm-door)" />
      </g>

      {/* Ruang guru */}
      <g className="sm-b sm-b-teachers" data-active={hide('teachers')}>
        <Building x={sb.x} y={sb.y} a={sb.a} b={sb.b} h={sb.h} roof="roofC" />
      </g>

      {/* TU dan keuangan */}
      <g className="sm-b sm-b-office" data-active={hide('office')}>
        <Building x={ob.x} y={ob.y} a={ob.a} b={ob.b} h={ob.h} roof="roofB" />
      </g>

      {/* Lapangan */}
      <g className="sm-b sm-b-field" data-active={hide('field')}>
        <polygon points={pts(field)} fill="var(--sm-field-t)" stroke="var(--sm-field-l)" strokeWidth={3} />
        <polygon points={pts(fieldIn)} fill="none" stroke="var(--sm-line)" strokeWidth={1.6} opacity={0.9} />
        <polyline
          points={pts(fieldMid)}
          fill="none"
          stroke="var(--sm-line)"
          strokeWidth={1.6}
          opacity={0.9}
        />
        <ellipse
          cx={fieldCenter[0]}
          cy={fieldCenter[1]}
          rx={26}
          ry={13}
          fill="none"
          stroke="var(--sm-line)"
          strokeWidth={1.6}
          opacity={0.9}
        />
      </g>

      {/* Pohon di belakang dan samping */}
      <Tree x={90} y={318} delay={0} />
      <Tree x={152} y={352} s={0.9} delay={2} />
      <Tree x={44} y={345} s={1.1} delay={4} />
      <Tree x={690} y={318} s={0.85} delay={1} />
      <Tree x={930} y={330} s={1.05} delay={3} />
      <Tree x={880} y={300} s={0.9} delay={5} />
      <Tree x={845} y={520} s={1.1} delay={2.5} />
      <Tree x={930} y={500} delay={1.5} />
      <Tree x={590} y={520} s={0.95} delay={4.5} />

      {/* Gerbang: tiang, palang, bilik */}
      <g className="sm-b sm-b-gate" data-active={hide('gate')}>
        <Box x={264} y={439.4} a={1.4} b={1.4} h={44} tone="wall" />
        <Box x={336} y={475.4} a={1.4} b={1.4} h={44} tone="wall" />
        <Box x={273} y={447.5} z={44} a={4} b={1} h={7} tone="roofB" />
        <Building x={kiosk.x} y={kiosk.y} a={kiosk.a} b={kiosk.b} h={kiosk.h} roof="roofB" />
      </g>

      {/* Kotak surat */}
      <g className="sm-b sm-b-mail" data-active={hide('mail')}>
        <ellipse cx={220} cy={370} rx={16} ry={5} fill="var(--sm-shadow)" />
        <Box x={220} y={361} a={1.3} b={1.3} h={24} tone="red" />
        <polygon points={pts(leftQuad(220, 361, 1.3, 0.25, 1.05, 15, 18))} fill="var(--sm-door)" />
      </g>

      <rect className="sm-tint" width={VIEW_W} height={VIEW_H} />

      {/* Jendela (di atas lapisan senja/malam agar menyala) */}
      <g>
        {cWins.map((w, i) => (
          <polygon
            key={`c${w[0]?.join('-')}`}
            points={pts(w)}
            className={litSet.has(i) ? 'sm-lit' : 'sm-glass'}
            opacity={active.classes ? 1 : 0.6}
          />
        ))}
        {staffWins.map((w) => (
          <polygon
            key={`s${w[0]?.join('-')}`}
            points={pts(w)}
            className={litStaff && active.teachers ? 'sm-lit' : 'sm-glass'}
          />
        ))}
        {officeWins.map((w) => (
          <polygon
            key={`o${w[0]?.join('-')}`}
            points={pts(w)}
            className={litStaff && active.office ? 'sm-lit' : 'sm-glass'}
          />
        ))}
        <polygon points={pts(kioskWin)} className={litStaff ? 'sm-lit' : 'sm-glass'} />
      </g>

      {/* Lonceng di kubah gedung kelas */}
      <g transform={`translate(${bellPos[0]} ${bellPos[1]})`}>
        <g className="sm-bell" data-ring={ringing ? 'true' : 'false'}>
          <path
            d="M-5 4 Q-5 -4 0 -5 Q5 -4 5 4 Z"
            fill="oklch(0.82 0.14 85)"
            stroke="oklch(0.6 0.12 75)"
            strokeWidth={0.8}
          />
          <circle cx={0} cy={5.2} r={1.5} fill="oklch(0.55 0.1 70)" />
        </g>
      </g>
    </g>
  );
});
