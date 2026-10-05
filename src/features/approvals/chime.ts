/**
 * Âm báo yêu cầu duyệt mới trên dashboard (01 §10.5 D13 "yêu cầu mới phát âm báo"): 2 nốt lên, tổng hợp bằng
 * Web Audio (không cần file). Trình duyệt chặn âm thanh khi trang chưa có thao tác người dùng → thử `resume()`;
 * vẫn bị chặn thì bỏ qua (badge + danh sách vẫn cập nhật).
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return null;
  ctx ??= new window.AudioContext();
  return ctx;
}

function note(ac: AudioContext, freq: number, start: number, duration: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.2, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration);
}

export function playApprovalChime(): void {
  const ac = audio();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume().catch(() => undefined);
  const t = ac.currentTime;
  note(ac, 660, t, 0.18);
  note(ac, 990, t + 0.2, 0.3);
}
