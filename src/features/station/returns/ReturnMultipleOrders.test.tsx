/**
 * Item 03 T-236 (BR-29, EX-R20; 01 §10.4 R1 / R3, 02b-station §4 / §8, DEC-510): bàn hoàn quét mã có ở ≥ 2 đơn của các
 * shop khác nhau → R4 vàng `RETURN_MULTIPLE_ORDERS` 1,5 giây → R3 điền `data.code`, mỗi dòng chip sàn · shop → chọn đúng
 * đơn → R2. MSW `StationSim`: mã đơn `2410DUP00001`, mã chiều về `RTTST-DUP-1` (02a §5.1 #15).
 */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { login } from "@/lib/api/auth";
import { DUP_ORDER_SN, DUP_RETURN_CODE, stationSim } from "@/mocks/stationSim";
import { renderApp } from "@/test/render";
import { hidScan } from "@/test/scan";

import { sound } from "../sound";
import { resetStationStore, useStationStore } from "../stationStore";

const play = vi.spyOn(sound, "play").mockImplementation(() => {});
vi.spyOn(sound, "stop").mockImplementation(() => {});

beforeEach(async () => {
  resetStationStore();
  play.mockClear();
  await login("tst_station01", "matkhau123", "STATION");
  stationSim.workMode = "RETURN";
  stationSim.operatorName = "Lan QA";
});

async function scanAtReturnDesk(code: string) {
  renderApp("/station");
  await screen.findByText("SẴN SÀNG NHẬN HÀNG HOÀN");
  await hidScan(code);
}

const rowOf = (dialog: HTMLElement, chipLabel: string) =>
  within(dialog).getByRole("img", { name: chipLabel }).closest("li")!;

test.each([
  ["mã đơn trùng", DUP_ORDER_SN, ["SPXTSTB000000021", "TTTST0000000021"]],
  ["mã chiều về trùng (§5.1 #15)", DUP_RETURN_CODE, ["SPXTSTB000000021", "TTTST0000000021"]],
])(
  "EX-R20 %s → R4 'MÃ CÓ Ở NHIỀU ĐƠN' + 2 bíp → R3 với mã, 2 dòng chip sàn · shop → chọn TikTok → R2",
  async (_label, code, trackings) => {
    const user = userEvent.setup({ delay: null });
    await scanAtReturnDesk(code);

    expect(await screen.findByText("MÃ CÓ Ở NHIỀU ĐƠN")).toBeInTheDocument();
    expect(
      screen.getByText(`Mã ${code} có ở 2 đơn của các shop khác nhau. Chọn đúng đơn.`),
    ).toBeInTheDocument();
    expect(play).toHaveBeenLastCalledWith("warn");
    expect(stationSim.session).toBeNull();

    const dialog = await screen.findByRole("dialog", { name: "Tìm kiện hoàn" }, { timeout: 4000 });
    expect(useStationStore.getState().lookup).toEqual({ query: code });
    expect(within(dialog).getByLabelText("Mã vận đơn hoặc mã đơn")).toHaveValue(code);
    for (const t of trackings) expect(await within(dialog).findByText(t)).toBeInTheDocument();
    const shopee = rowOf(dialog, "Sàn: Shopee, shop TST B");
    const tiktok = rowOf(dialog, "Sàn: TikTok Shop, shop TST TikTok A (mock)");
    expect(within(shopee).getByText("SPXTSTB000000021")).toBeInTheDocument();
    expect(within(shopee).getByText("Shopee · TST B")).toBeInTheDocument();
    expect(within(tiktok).getByText("TikTok · TST TikTok A (mock)")).toBeInTheDocument();

    await user.click(within(tiktok).getByRole("button", { name: "Mở phiên" }));

    expect(await screen.findByText("ĐANG KIỂM HÀNG HOÀN")).toBeInTheDocument();
    expect(stationSim.session?.package.tracking_number ?? null).toBe("TTTST0000000021");
    expect(
      screen.getByRole("img", { name: "Sàn: TikTok Shop, shop TST TikTok A (mock)" }),
    ).toBeInTheDocument();
  },
);

test("R3: kiện chưa gắn shop → chip 'Chưa rõ sàn'", async () => {
  const user = userEvent.setup({ delay: null });
  renderApp("/station");
  await screen.findByText("SẴN SÀNG NHẬN HÀNG HOÀN");
  await user.click(screen.getByRole("button", { name: /Tìm thủ công/ }));
  const dialog = await screen.findByRole("dialog", { name: "Tìm kiện hoàn" });
  // Dán (không gõ phím nhanh — tránh bộ đọc quét HID).
  await user.paste("SPXTSTX0000001");
  await user.click(within(dialog).getByRole("button", { name: "Tìm" }));

  const row = (await within(dialog).findByText("SPXTSTX0000001")).closest("li")!;
  expect(within(row).getByRole("img", { name: "Chưa rõ sàn" })).toHaveTextContent("Chưa rõ sàn");
});

test("Mã có ở 1 hồ sơ mở (không trùng shop) → mở R2 thẳng, không R4 nhiều đơn", async () => {
  await scanAtReturnDesk("SPXRTTST000041");
  expect(await screen.findByText("ĐANG KIỂM HÀNG HOÀN")).toBeInTheDocument();
  expect(screen.queryByText("MÃ CÓ Ở NHIỀU ĐƠN")).not.toBeInTheDocument();
});
