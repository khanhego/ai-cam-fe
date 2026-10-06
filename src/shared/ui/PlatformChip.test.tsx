import { render, screen } from "@testing-library/react";

import { PlatformChip } from "./PlatformChip";
import { platformChipText } from "./platformChipText";

/** 02b-admin §13 / 02b-station §13: `PlatformChip` 3 dạng + một shop duy nhất + tên dài (TC-03.80, TC-05.73). */
test("Shopee / TikTok · shop, aria-label đầy đủ", () => {
  render(
    <>
      <PlatformChip platform="SHOPEE" shopName="TST B" />
      <PlatformChip platform="TIKTOK" shopName="Áo Đẹp Official" size="lg" />
    </>,
  );
  expect(screen.getByRole("img", { name: "Sàn: Shopee, shop TST B" })).toHaveTextContent("Shopee · TST B");
  const tt = screen.getByRole("img", { name: "Sàn: TikTok Shop, shop Áo Đẹp Official" });
  expect(tt).toHaveTextContent("TikTok · Áo Đẹp Official");
  expect(tt.querySelector(".text-\\[24px\\]")).not.toBeNull();
});

test("chưa rõ sàn (`platform = null`) và sàn một shop → chỉ tên sàn", () => {
  render(
    <>
      <PlatformChip platform={null} shopName={null} />
      <PlatformChip platform="TIKTOK" shopName="TST TikTok A (mock)" single />
    </>,
  );
  expect(screen.getByRole("img", { name: "Chưa rõ sàn" })).toHaveTextContent("Chưa rõ sàn");
  expect(screen.getByRole("img", { name: "Sàn: TikTok Shop, shop TST TikTok A (mock)" })).toHaveTextContent(
    /^TikTok$/,
  );
});

test("RF-31: tên shop > 28 ký tự cắt '…', title giữ tên đầy đủ", () => {
  const long = "Cửa hàng thời trang Áo Đẹp Official Store";
  render(<PlatformChip platform="SHOPEE" shopName={long} />);
  const chip = screen.getByRole("img", { name: `Sàn: Shopee, shop ${long}` });
  expect(chip).toHaveAttribute("title", long);
  expect(chip).toHaveTextContent(`Shopee · ${long.slice(0, 28)}…`);
  expect(platformChipText("SHOPEE", "TST Shop A")).toBe("Shopee · TST Shop A");
});
