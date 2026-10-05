import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { File as NodeFile } from "node:buffer";

import { login } from "@/lib/api/auth";
import { mockImports, TEMPLATE_COLUMNS } from "@/mocks/handlers/imports";
import { mockPackages } from "@/mocks/packagesDb";
import { renderApp } from "@/test/render";
import { withNodeFormData } from "@/test/nodeFormData";

withNodeFormData();

/** File của Node: FormData (undici) trong jsdom không đọc được Blob của jsdom. */
const mkFile = (content: string, name: string) => new NodeFile([content], name) as unknown as File;

const HEADER = TEMPLATE_COLUMNS.join(",");
const row = (n: number, tracking = `SPXCSV${String(n).padStart(7, "0")}`) =>
  `2410CSV${String(n).padStart(5, "0")},${tracking},SKU${n},Áo thun basic,Đen / L,1,`;
const csv = (lines: string[], name = "don.csv") => mkFile([HEADER, ...lines].join("\n"), name);

const fileInput = () => screen.findByLabelText("File đơn hàng (.csv, .xlsx)");
/** `user.upload` bọc lại File (thành File của jsdom) → dùng change event với File của Node. */
const pick = async (file: File) => fireEvent.change(await fileInput(), { target: { files: [file] } });

beforeEach(async () => {
  await login("tst_sup", "matkhau123", "DASHBOARD");
});

test("TC-05.11: file tốt → bộ đếm, 20 dòng đầu, Nhập N đơn → Đã nhập + dòng mới trong Lịch sử", async () => {
  const user = userEvent.setup();
  renderApp("/admin/imports");
  const lines = Array.from({ length: 25 }, (_, i) => row(i + 1));

  await pick(csv(lines, "don-05-10.csv"));

  const preview = await screen.findByRole("region", { name: "Xem trước: don-05-10.csv" });
  expect(
    within(preview).getByText("Mới 25 · Cập nhật 0 · Bỏ qua 0 (đã có từ Shopee) · Lỗi 0"),
  ).toBeInTheDocument();
  const sample = screen.getByRole("table", { name: "20 dòng đầu" });
  expect(within(sample).getAllByRole("row")).toHaveLength(21);
  await user.click(screen.getByRole("button", { name: "Nhập 25 đơn" }));

  expect(await screen.findByText("Đã nhập 25 đơn.")).toBeInTheDocument();
  const history = await screen.findByRole("table", { name: "Lịch sử nhập" });
  const first = within(history).getAllByRole("row")[1]!;
  expect(within(first).getByText("don-05-10.csv")).toBeInTheDocument();
  expect(within(first).getByText("Nguyễn B")).toBeInTheDocument();
  expect(within(first).getByText("Đã nhập")).toBeInTheDocument();
  expect(mockPackages.find((p) => p.tracking_number === "SPXCSV0000025")?.order?.source).toBe("CSV");
  // Về lại bước chọn file
  expect(screen.getByRole("button", { name: "Chọn file" })).toBeInTheDocument();
});

test("TC-05.12: 1 dòng lỗi → Alert, bảng lỗi (dòng, cột, lý do), nút Nhập bị khóa", async () => {
  renderApp("/admin/imports");
  const lines = Array.from({ length: 12 }, (_, i) => (i === 10 ? row(i + 1, "") : row(i + 1)));

  await pick(csv(lines, "one_error.csv"));

  expect(
    await screen.findByText("File có 1 dòng lỗi. Sửa file rồi tải lại; chưa có đơn nào được nhập."),
  ).toBeInTheDocument();
  const errors = screen.getByRole("table", { name: "Dòng lỗi" });
  const cells = within(within(errors).getAllByRole("row")[1]!).getAllByRole("cell");
  expect(cells.map((c) => c.textContent)).toEqual(["12", "Mã vận đơn", "Bỏ trống"]);
  expect(screen.getByRole("button", { name: /^Nhập \d+ đơn$/ })).toBeDisabled();
  expect(mockPackages.some((p) => p.tracking_number === "SPXCSV0000001")).toBe(false);
});

test("TC-05.13: thiếu cột bắt buộc → chữ theo tên cột tiếng Việt, ở lại bước chọn file", async () => {
  renderApp("/admin/imports");
  const file = mkFile("platform_order_sn,product_name,quantity\n2410CSV00001,Áo,1", "missing_column.csv");

  await pick(file);

  expect(await screen.findByText("File thiếu cột bắt buộc: Mã vận đơn. Dùng file mẫu.")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Chọn file" })).toBeEnabled());
});

test("TC-05.15 (UI): đơn đã có từ Shopee → Bỏ qua, không tính vào số đơn nhập", async () => {
  renderApp("/admin/imports");
  const lines = [
    "2410TST00001,SPXTST0000001,SKU1,Áo,Đen,1,",
    "2410TST00002,SPXTST0000002,SKU2,Áo,Đen,1,",
    row(1),
  ];

  await pick(csv(lines));

  const preview = await screen.findByRole("region", { name: "Xem trước: don.csv" });
  expect(
    within(preview).getByText("Mới 1 · Cập nhật 0 · Bỏ qua 2 (đã có từ Shopee) · Lỗi 0"),
  ).toBeInTheDocument();
  expect(within(screen.getByRole("table", { name: "20 dòng đầu" })).getAllByText("Bỏ qua")).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Nhập 1 đơn" })).toBeEnabled();
});

test("client chặn file sai loại và > 5 MB trước khi gửi", async () => {
  renderApp("/admin/imports");
  const before = mockImports.length;

  await pick(mkFile("x", "don.pdf"));
  expect(await screen.findByText("File phải là .csv hoặc .xlsx. Dùng file mẫu.")).toBeInTheDocument();

  const big = mkFile("x", "lon.csv");
  Object.defineProperty(big, "size", { value: 5 * 1024 * 1024 + 1 });
  await pick(big);
  expect(await screen.findByText("File lớn hơn 5 MB. Chia nhỏ file rồi tải lại.")).toBeInTheDocument();
  expect(mockImports).toHaveLength(before);
});

test("TC-05.17 (UI): xem trước hết hạn → Alert, quay về bước chọn file", async () => {
  const user = userEvent.setup();
  renderApp("/admin/imports");
  await pick(csv([row(1)]));
  await screen.findByRole("button", { name: "Nhập 1 đơn" });
  mockImports[0]!.expires_at = new Date(Date.now() - 1000).toISOString();

  await user.click(screen.getByRole("button", { name: "Nhập 1 đơn" }));

  expect(await screen.findByText("Bản xem trước đã hết hạn. Tải file lại.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Chọn file" })).toBeInTheDocument();
});

test("Chọn file khác → bỏ bản xem trước", async () => {
  const user = userEvent.setup();
  renderApp("/admin/imports");
  await pick(csv([row(1)]));

  await user.click(await screen.findByRole("button", { name: "Chọn file khác" }));

  expect(screen.queryByRole("button", { name: "Nhập 1 đơn" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Chọn file" })).toBeInTheDocument();
});

test("TC-05.21 (UI): file gốc quá 90 ngày → toast", async () => {
  const user = userEvent.setup();
  mockImports[0]!.fileExpired = true;
  renderApp("/admin/imports");

  const history = await screen.findByRole("table", { name: "Lịch sử nhập" });
  await user.click(within(history).getByRole("button", { name: "Tải file gốc don-03-10.csv" }));

  expect(await screen.findByText("File gốc đã quá 90 ngày, không còn lưu.")).toBeInTheDocument();
});

test("TC-05.18 (UI): tải file gốc + file mẫu gọi API-54 / API-53 và lưu file", async () => {
  const user = userEvent.setup();
  const create = vi.fn(() => "blob:mock");
  const revoke = vi.fn();
  Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  renderApp("/admin/imports");

  const history = await screen.findByRole("table", { name: "Lịch sử nhập" });
  await user.click(within(history).getByRole("button", { name: "Tải file gốc don-03-10.csv" }));
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  await user.click(screen.getByRole("button", { name: "Tải file mẫu" }));
  await waitFor(() => expect(click).toHaveBeenCalledTimes(2));
  expect(create).toHaveBeenCalledTimes(2);
  click.mockRestore();
});

test("Lịch sử rỗng → Chưa nhập file nào.", async () => {
  mockImports.splice(0);
  renderApp("/admin/imports");

  expect(await screen.findByText("Chưa nhập file nào.")).toBeInTheDocument();
});

test("TC-P.06 (UI): CSKH không vào được D5, menu không có Nhập đơn; Supervisor có", async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");
  const router = renderApp("/admin/imports");

  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/forbidden"));
  const nav = screen.getByRole("navigation", { name: "Điều hướng chính" });
  expect(within(nav).queryByRole("link", { name: /Nhập đơn/ })).not.toBeInTheDocument();
});

test("Supervisor: menu có Nhập đơn", async () => {
  renderApp("/admin/imports");

  const nav = await screen.findByRole("navigation", { name: "Điều hướng chính" });
  expect(within(nav).getByRole("link", { name: /Nhập đơn/ })).toHaveAttribute("aria-current", "page");
});
