import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * tokens.css (sinh bằng `pnpm tokens`) phải khớp tài liệu docs/design-system/tokens.json ở repo gốc (DEC-43).
 * Bỏ qua khi repo FE đứng riêng (CI của ai-cam-fe không có thư mục docs).
 */
const DOC = resolve(__dirname, "../../../docs/design-system/tokens.json");
const CSS = resolve(__dirname, "./tokens.css");

type DocToken = { name: string; value: { light: string; dark: string } };

function cssRoles(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--md-sys-color-([a-z-]+): (#[0-9a-f]{6});/g)].map((m) => [m[1]!, m[2]!]),
  );
}

describe.skipIf(!existsSync(DOC))("design tokens", () => {
  const css = readFileSync(CSS, "utf8");
  const light = cssRoles(css.split("@media")[0]!);
  const dark = cssRoles(css.split(':root[data-theme="dark"]')[1]!);
  const doc = JSON.parse(readFileSync(DOC, "utf8")) as { color: { tokens: DocToken[] } };

  test.each(doc.color.tokens.map((t) => [t.name, t] as const))("%s khớp tài liệu", (_, token) => {
    expect(light[token.name]).toBe(token.value.light.toLowerCase());
    expect(dark[token.name]).toBe(token.value.dark.toLowerCase());
  });
});
