/** Ghép class, bỏ giá trị rỗng. */
export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");
