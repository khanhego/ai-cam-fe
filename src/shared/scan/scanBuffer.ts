/**
 * Gom phím từ máy quét HID (02b-station §10): khoảng cách giữa 2 phím ≤ 50 ms, kết thúc bằng Enter, ≥ 4 ký tự.
 * Gõ tay (chậm hơn) bị bỏ qua. Tách khỏi hook để test thuần, không cần DOM.
 */
export const MAX_GAP_MS = 50;
export const MIN_LENGTH = 4;

export class ScanBuffer {
  private chars = "";
  private lastAt = -Infinity;

  /** Trả mã khi một lần quét hoàn tất, ngược lại null. */
  push(key: string, at: number): string | null {
    if (at - this.lastAt > MAX_GAP_MS) this.chars = "";
    this.lastAt = at;
    if (key === "Enter") {
      const code = this.chars.trim();
      this.chars = "";
      return code.length >= MIN_LENGTH ? code : null;
    }
    if (key.length === 1) this.chars += key;
    return null;
  }

  reset() {
    this.chars = "";
    this.lastAt = -Infinity;
  }
}
