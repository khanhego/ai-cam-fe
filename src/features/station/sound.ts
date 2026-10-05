/**
 * Âm thanh station (design system "Station kiosk"): ok = 1 bíp ngắn, warn = 2 bíp, error = âm dài lặp tới khi dừng.
 * Tổng hợp bằng Web Audio (không cần file, chạy offline — DEC-50). Kiosk chạy Chromium `--autoplay-policy=no-user-gesture-required`.
 */
export type SoundKind = "ok" | "warn" | "error";

let ctx: AudioContext | null = null;
let errorTimer: ReturnType<typeof setInterval> | undefined;

function audio(): AudioContext | null {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return null;
  ctx ??= new window.AudioContext();
  return ctx;
}

function tone(freq: number, startS: number, durationS: number) {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.frequency.value = freq;
  osc.type = "square";
  gain.gain.value = 0.15;
  osc.connect(gain).connect(ac.destination);
  const t = ac.currentTime + startS;
  osc.start(t);
  osc.stop(t + durationS);
}

export const sound = {
  play(kind: SoundKind, { loop = false }: { loop?: boolean } = {}) {
    sound.stop();
    if (kind === "ok") tone(1200, 0, 0.12);
    if (kind === "warn") {
      tone(880, 0, 0.12);
      tone(880, 0.2, 0.12);
    }
    if (kind === "error") {
      tone(330, 0, 1);
      if (loop) errorTimer = setInterval(() => tone(330, 0, 1), 1600);
    }
  },
  stop() {
    clearInterval(errorTimer);
    errorTimer = undefined;
  },
};
