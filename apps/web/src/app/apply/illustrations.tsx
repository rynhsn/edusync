/** Gedung sekolah dengan matahari, awan, dan buku melayang. Warna mengikuti token tema. */
export function SchoolIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 360" role="img" aria-hidden className={className} fill="none">
      <circle cx="388" cy="78" r="44" className="fill-[var(--ap-orange)]" opacity="0.9" />
      <circle cx="388" cy="78" r="64" className="fill-[var(--ap-orange)]" opacity="0.18" />
      <g className="ap-float-slow">
        <ellipse cx="120" cy="82" rx="46" ry="16" className="fill-primary" opacity="0.14" />
        <ellipse cx="146" cy="70" rx="30" ry="14" className="fill-primary" opacity="0.14" />
      </g>
      <ellipse cx="240" cy="326" rx="200" ry="18" className="fill-primary" opacity="0.12" />
      {/* bangunan */}
      <rect x="112" y="170" width="256" height="150" rx="10" className="fill-primary" />
      <rect x="112" y="170" width="256" height="22" rx="10" className="fill-primary" opacity="0.7" />
      <path d="M96 176 240 92l144 84z" className="fill-[var(--ap-orange)]" />
      <path d="M96 176 240 92l144 84z" fill="white" opacity="0.12" />
      <rect x="216" y="236" width="48" height="84" rx="6" className="fill-background" />
      <circle cx="240" cy="148" r="16" className="fill-background" />
      <path
        d="M240 138v10h8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="text-primary"
      />
      {[136, 170, 276, 310].map((x) => (
        <rect
          key={x}
          x={x}
          y="214"
          width="26"
          height="34"
          rx="5"
          className="fill-background"
          opacity="0.92"
        />
      ))}
      {[136, 170, 276, 310].map((x) => (
        <rect
          key={`l${x}`}
          x={x}
          y="214"
          width="26"
          height="12"
          rx="5"
          className="fill-amber"
          opacity="0.8"
        />
      ))}
      {/* tiang bendera */}
      <path
        d="M72 320V200"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        className="text-primary"
      />
      <path d="M74 202h38l-10 12 10 12H74z" className="fill-[var(--ap-orange)]" />
      {/* buku melayang */}
      <g className="ap-float" style={{ transformOrigin: '420px 230px' }}>
        <rect x="396" y="214" width="50" height="38" rx="5" className="fill-amber" />
        <path d="M421 214v38" stroke="currentColor" strokeWidth="2" className="text-primary" opacity="0.5" />
        <path
          d="M404 226h10M404 234h10M428 226h10M428 234h10"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.8"
        />
      </g>
      {/* semak */}
      <circle cx="100" cy="318" r="16" className="fill-primary" opacity="0.5" />
      <circle cx="380" cy="320" r="14" className="fill-primary" opacity="0.5" />
    </svg>
  );
}

/** Siswa dengan tas dan buku: dipakai di keadaan kosong dan pesan galat yang ramah. */
export function StudentIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 300" role="img" aria-hidden className={className} fill="none">
      <ellipse cx="160" cy="278" rx="120" ry="12" className="fill-primary" opacity="0.12" />
      <circle cx="160" cy="150" r="124" className="fill-[var(--ap-orange)]" opacity="0.12" />
      {/* tubuh */}
      <path d="M104 268v-58a56 56 0 0 1 112 0v58z" className="fill-primary" />
      <path d="M144 158h32v26a16 16 0 0 1-32 0z" className="fill-[var(--ap-orange)]" opacity="0.9" />
      {/* kepala */}
      <circle cx="160" cy="116" r="38" className="fill-[var(--ap-orange)]" />
      <path
        d="M122 112c2-26 20-38 40-38s36 12 38 36c-14-8-24-16-30-26-8 12-28 22-48 28z"
        className="fill-foreground"
        opacity="0.85"
      />
      <circle cx="146" cy="122" r="3.2" className="fill-foreground" />
      <circle cx="174" cy="122" r="3.2" className="fill-foreground" />
      <path
        d="M150 136q10 9 20 0"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="text-foreground"
      />
      {/* buku di tangan */}
      <g className="ap-float" style={{ transformOrigin: '160px 218px' }}>
        <path d="M112 206l48 12 48-12v44l-48 12-48-12z" className="fill-amber" />
        <path d="M160 218v44" stroke="currentColor" strokeWidth="2" className="text-primary" opacity="0.5" />
      </g>
      {/* bintang kecil */}
      <path d="M250 70l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" className="fill-amber" />
      <path d="M62 96l3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z" className="fill-[var(--ap-orange)]" />
    </svg>
  );
}

/** Tumpukan buku dan pensil: hiasan untuk langkah dan kartu. */
export function BookIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 160" role="img" aria-hidden className={className} fill="none">
      <rect x="30" y="104" width="140" height="28" rx="6" className="fill-primary" />
      <rect x="44" y="76" width="120" height="28" rx="6" className="fill-[var(--ap-orange)]" />
      <rect x="36" y="50" width="108" height="26" rx="6" className="fill-amber" />
      <path
        d="M40 118h120M54 90h100M46 63h88"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M150 36l18 52"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
        className="text-primary"
      />
      <path d="M150 36l-5-14 12 4z" className="fill-foreground" />
    </svg>
  );
}
