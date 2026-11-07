import type { Tone } from './scan-logic';

let audio: AudioContext | null = null;

type AudioCtor = typeof AudioContext;

/** Siapkan konteks audio; dipanggil dari ketukan pengguna (aturan autoplay peramban). */
export function unlockAudio() {
  try {
    const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return;
    audio ??= new Ctor();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    // tanpa bunyi
  }
}

/** Bunyi bip pendek (berhasil), sedang (perlu perhatian), atau rendah-panjang (gagal) dan getar bila didukung. */
export function feedback(tone: Tone) {
  try {
    if (audio && audio.state === 'running') {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = tone === 'success' ? 880 : tone === 'warn' ? 560 : 220;
      gain.gain.value = 0.12;
      osc.connect(gain);
      gain.connect(audio.destination);
      const end = audio.currentTime + (tone === 'error' ? 0.4 : tone === 'warn' ? 0.22 : 0.12);
      osc.start();
      osc.stop(end);
    }
  } catch {
    // tanpa bunyi
  }
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(tone === 'success' ? 60 : [120, 60, 120]);
    }
  } catch {
    // tanpa getar
  }
}
