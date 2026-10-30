/**
 * CSS peta sekolah. Palet diambil dari nada tema (teal, amber) dengan varian gelap di bawah `.dark`.
 * Setiap bidang isometrik punya tiga nada: atas (terang), kiri (sedang), kanan (gelap).
 * Animasi hanya transform/opacity; semuanya mati di bawah prefers-reduced-motion.
 */
export const MAP_CSS = `
.sm-root {
  --sm-grass: oklch(0.9 0.055 142);
  --sm-grass-2: oklch(0.925 0.05 142);
  --sm-hill-far: oklch(0.82 0.05 175);
  --sm-hill-near: oklch(0.86 0.06 160);
  --sm-path: oklch(0.955 0.03 88);
  --sm-path-edge: oklch(0.86 0.04 85);
  --sm-road: oklch(0.8 0.012 230);
  --sm-road-line: oklch(0.97 0.01 90);
  --sm-fence: oklch(0.97 0.01 90);
  --sm-fence-edge: oklch(0.78 0.02 90);
  --sm-wall-t: oklch(0.97 0.02 88);
  --sm-wall-l: oklch(0.92 0.03 85);
  --sm-wall-r: oklch(0.86 0.035 80);
  --sm-roofA-t: oklch(0.72 0.085 192);
  --sm-roofA-l: oklch(0.62 0.09 192);
  --sm-roofA-r: oklch(0.54 0.09 194);
  --sm-roofB-t: oklch(0.86 0.11 82);
  --sm-roofB-l: oklch(0.76 0.12 78);
  --sm-roofB-r: oklch(0.67 0.12 72);
  --sm-roofC-t: oklch(0.74 0.08 262);
  --sm-roofC-l: oklch(0.64 0.09 262);
  --sm-roofC-r: oklch(0.55 0.09 262);
  --sm-red-t: oklch(0.78 0.12 28);
  --sm-red-l: oklch(0.68 0.14 28);
  --sm-red-r: oklch(0.58 0.14 26);
  --sm-field-t: oklch(0.8 0.1 150);
  --sm-field-l: oklch(0.72 0.1 150);
  --sm-line: oklch(0.98 0.01 120);
  --sm-glass: oklch(0.86 0.05 225);
  --sm-glass-dark: oklch(0.55 0.05 240);
  --sm-lit: oklch(0.9 0.14 90);
  --sm-door: oklch(0.55 0.07 50);
  --sm-trunk: oklch(0.5 0.06 55);
  --sm-tree-l: oklch(0.8 0.12 148);
  --sm-tree-m: oklch(0.7 0.12 150);
  --sm-tree-d: oklch(0.6 0.11 152);
  --sm-shadow: oklch(0.3 0.04 200 / 0.18);
  --sm-cloud: oklch(1 0 0 / 0.92);
  --sm-sun: oklch(0.9 0.15 90);
  --sm-moon: oklch(0.95 0.03 100);
  --sm-fig-0: oklch(0.52 0.1 192);
  --sm-fig-1: oklch(0.55 0.1 262);
  --sm-fig-2: oklch(0.6 0.08 160);
  --sm-fig-late: oklch(0.7 0.16 55);
  --sm-skin: oklch(0.82 0.06 70);
  --sm-tint: transparent;
  --sm-tint-o: 0;
  --sm-sky-top: oklch(0.82 0.09 235);
  --sm-sky-bot: oklch(0.95 0.03 225);
  --sm-dim: 0;
  position: relative;
  container-type: inline-size;
}
.dark .sm-root {
  --sm-grass: oklch(0.36 0.05 160);
  --sm-grass-2: oklch(0.39 0.05 160);
  --sm-hill-far: oklch(0.3 0.04 190);
  --sm-hill-near: oklch(0.33 0.05 175);
  --sm-path: oklch(0.5 0.025 85);
  --sm-path-edge: oklch(0.42 0.03 85);
  --sm-road: oklch(0.3 0.015 240);
  --sm-road-line: oklch(0.7 0.01 90);
  --sm-fence: oklch(0.68 0.01 90);
  --sm-fence-edge: oklch(0.5 0.02 90);
  --sm-wall-t: oklch(0.62 0.03 85);
  --sm-wall-l: oklch(0.52 0.035 85);
  --sm-wall-r: oklch(0.43 0.035 80);
  --sm-roofA-t: oklch(0.55 0.08 192);
  --sm-roofA-l: oklch(0.46 0.08 192);
  --sm-roofA-r: oklch(0.39 0.07 194);
  --sm-roofB-t: oklch(0.66 0.1 82);
  --sm-roofB-l: oklch(0.56 0.1 78);
  --sm-roofB-r: oklch(0.48 0.09 72);
  --sm-roofC-t: oklch(0.56 0.08 262);
  --sm-roofC-l: oklch(0.47 0.08 262);
  --sm-roofC-r: oklch(0.4 0.07 262);
  --sm-red-t: oklch(0.6 0.11 28);
  --sm-red-l: oklch(0.51 0.12 28);
  --sm-red-r: oklch(0.43 0.12 26);
  --sm-field-t: oklch(0.52 0.09 150);
  --sm-field-l: oklch(0.45 0.09 150);
  --sm-line: oklch(0.8 0.02 120);
  --sm-glass: oklch(0.5 0.05 230);
  --sm-glass-dark: oklch(0.32 0.04 250);
  --sm-door: oklch(0.38 0.05 50);
  --sm-trunk: oklch(0.36 0.04 55);
  --sm-tree-l: oklch(0.52 0.1 148);
  --sm-tree-m: oklch(0.44 0.1 150);
  --sm-tree-d: oklch(0.37 0.09 152);
  --sm-shadow: oklch(0.1 0.02 200 / 0.3);
  --sm-cloud: oklch(0.8 0.01 230 / 0.75);
  --sm-fig-0: oklch(0.78 0.1 190);
  --sm-fig-1: oklch(0.78 0.09 262);
  --sm-fig-2: oklch(0.8 0.09 160);
  --sm-fig-late: oklch(0.8 0.15 60);
  --sm-dim: 0.28;
}
.sm-root[data-phase='morning'] { --sm-sky-top: oklch(0.84 0.07 225); --sm-sky-bot: oklch(0.96 0.05 95); }
.sm-root[data-phase='noon'] { --sm-sky-top: oklch(0.8 0.1 235); --sm-sky-bot: oklch(0.95 0.03 225); }
.sm-root[data-phase='evening'] {
  --sm-sky-top: oklch(0.7 0.1 300);
  --sm-sky-bot: oklch(0.87 0.13 62);
  --sm-tint: oklch(0.75 0.14 55);
  --sm-tint-o: 0.16;
}
.sm-root[data-phase='night'] {
  --sm-sky-top: oklch(0.2 0.05 265);
  --sm-sky-bot: oklch(0.34 0.07 270);
  --sm-tint: oklch(0.2 0.08 265);
  --sm-tint-o: 0.5;
  --sm-cloud: oklch(0.6 0.03 270 / 0.4);
}
.dark .sm-root[data-phase='evening'] { --sm-tint-o: 0.3; }
.dark .sm-root[data-phase='night'] { --sm-tint-o: 0.55; --sm-dim: 0; }

.sm-sky-dim { fill: oklch(0.1 0.02 250); opacity: var(--sm-dim); }
.sm-tint { fill: var(--sm-tint); opacity: var(--sm-tint-o); pointer-events: none; }
.sm-stars { opacity: 0; transition: opacity 1.2s; }
.sm-root[data-phase='night'] .sm-stars { opacity: 1; }
.sm-glass { fill: var(--sm-glass); }
.sm-root[data-phase='night'] .sm-glass { fill: var(--sm-glass-dark); }
.sm-lit { fill: var(--sm-lit); filter: drop-shadow(0 0 3px oklch(0.9 0.14 90 / 0.8)); }
.sm-root[data-phase='morning'] .sm-lit, .sm-root[data-phase='noon'] .sm-lit { filter: none; }

/* Bangunan nonaktif: modul mati atau tanpa izin. */
.sm-b { transition: opacity 0.4s, filter 0.2s; }
.sm-b[data-active='false'] { opacity: 0.5; filter: saturate(0.35); }
.sm-stage:has(a[data-b='gate']:is(:hover, :focus-visible)) .sm-b-gate,
.sm-stage:has(a[data-b='classes']:is(:hover, :focus-visible)) .sm-b-classes,
.sm-stage:has(a[data-b='teachers']:is(:hover, :focus-visible)) .sm-b-teachers,
.sm-stage:has(a[data-b='office']:is(:hover, :focus-visible)) .sm-b-office,
.sm-stage:has(a[data-b='field']:is(:hover, :focus-visible)) .sm-b-field,
.sm-stage:has(a[data-b='mail']:is(:hover, :focus-visible)) .sm-b-mail { filter: brightness(1.08) saturate(1.1); }

/* Sosok. */
.sm-fig { pointer-events: none; }
.sm-fig-body { fill: var(--sm-fig-0); }
.sm-fig-v1 .sm-fig-body { fill: var(--sm-fig-1); }
.sm-fig-v2 .sm-fig-body { fill: var(--sm-fig-2); }
.sm-fig-late .sm-fig-body { fill: var(--sm-fig-late); }
.sm-fig-head { fill: var(--sm-skin); }
.sm-fig-shadow { fill: var(--sm-shadow); }
.sm-idle { transition: opacity 0.6s; }
.sm-idle[data-in='false'] { opacity: 0; }
@keyframes sm-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.6px); } }
.sm-bob { animation: sm-bob 0.42s ease-in-out infinite; }

/* Awan, pohon, lonceng. */
@keyframes sm-drift { from { transform: translateX(-280px); } to { transform: translateX(1240px); } }
.sm-cloud { animation: sm-drift linear infinite; }
@keyframes sm-sway { 0%, 100% { transform: rotate(-1.4deg); } 50% { transform: rotate(1.4deg); } }
.sm-sway { transform-origin: 0 -18px; animation: sm-sway 5.5s ease-in-out infinite; }
@keyframes sm-ring { 0%, 100% { transform: rotate(0); } 15% { transform: rotate(18deg); } 35% { transform: rotate(-16deg); } 55% { transform: rotate(11deg); } 75% { transform: rotate(-7deg); } }
.sm-bell { transform-box: fill-box; transform-origin: 50% 0; }
.sm-bell[data-ring='true'] { animation: sm-ring 1.3s ease-in-out 2; }
@keyframes sm-twinkle { 0%, 100% { opacity: 0.9; } 50% { opacity: 0.35; } }
.sm-star { animation: sm-twinkle 3.2s ease-in-out infinite; }

.sm-stage[data-paused='true'] * { animation-play-state: paused !important; }

/* Pil lencana dan tooltip (HTML di atas SVG). */
@keyframes sm-pop { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.sm-pop { animation: sm-pop 0.35s ease-out both; }
@keyframes sm-in { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }
.sm-in { animation: sm-in 0.4s ease-out both; }
@keyframes sm-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.sm-live-dot { animation: sm-pulse 2s ease-in-out infinite; }

@media (prefers-reduced-motion: reduce) {
  .sm-bob, .sm-cloud, .sm-sway, .sm-star, .sm-live-dot, .sm-pop, .sm-in { animation: none !important; }
  .sm-bell[data-ring='true'] { animation: none !important; }
  .sm-idle, .sm-b, .sm-stars { transition: none !important; }
}
`;
