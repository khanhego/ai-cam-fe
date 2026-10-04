/** Theme light/dark (design system §Màu): mặc định light, lưu `aicam-theme`; station luôn light. */
export type Theme = "light" | "dark";
const KEY = "aicam-theme";

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // trình duyệt chặn localStorage: chỉ đổi trong phiên
  }
}
