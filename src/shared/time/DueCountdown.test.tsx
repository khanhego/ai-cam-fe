import { render, screen } from "@testing-library/react";

import { DueCountdown } from "./DueCountdown";
import { remainingText } from "./dueText";

/** 02b-admin §13: `DueCountdown` — biên 48 giờ, quá hạn, ⓘ hạn mặc định (FR-08.08, BR-40). */
const NOW = Date.parse("2026-10-07T03:00:00Z");
const at = (hours: number) => new Date(NOW + hours * 3_600_000).toISOString();

test("chữ còn lại: ngày + giờ / giờ + phút / phút", () => {
  expect(remainingText(NOW + 28 * 3_600_000, NOW)).toBe("còn 1 ngày 4 giờ");
  expect(remainingText(NOW + 72 * 3_600_000, NOW)).toBe("còn 3 ngày");
  expect(remainingText(NOW + 5 * 3_600_000 + 20 * 60_000, NOW)).toBe("còn 5 giờ 20 phút");
  expect(remainingText(NOW + 12 * 60_000, NOW)).toBe("còn 12 phút");
  expect(remainingText(NOW + 30_000, NOW)).toBe("còn dưới 1 phút");
  expect(remainingText(NOW, NOW)).toBeNull();
});

test("biên 48 giờ: đúng 48 giờ → đỏ; 48 giờ 1 phút → thường", () => {
  const { rerender } = render(<DueCountdown dueAt={at(48)} now={NOW} />);
  expect(screen.getByText("còn 2 ngày")).toHaveAttribute("data-urgent", "true");
  rerender(<DueCountdown dueAt={at(48 + 1 / 60)} now={NOW} />);
  expect(screen.getByText("còn 2 ngày")).not.toHaveAttribute("data-urgent");
});

test("quá hạn → chip 'Quá hạn'; không có hạn → '—'", () => {
  const { rerender } = render(<DueCountdown dueAt={at(-1)} now={NOW} />);
  expect(screen.getByText("Quá hạn")).toBeInTheDocument();
  rerender(<DueCountdown dueAt={null} now={NOW} />);
  expect(screen.getByText("—")).toBeInTheDocument();
});

test("nguồn DEFAULT → ⓘ 'Sàn không trả hạn — dùng mặc định 48 giờ từ lúc sàn báo.'; PLATFORM → không có", () => {
  const { rerender } = render(<DueCountdown dueAt={at(10)} source="DEFAULT" now={NOW} />);
  expect(
    screen.getByRole("img", {
      name: "Cách tính hạn: Sàn không trả hạn — dùng mặc định 48 giờ từ lúc sàn báo.",
    }),
  ).toBeInTheDocument();
  rerender(<DueCountdown dueAt={at(10)} source="PLATFORM" now={NOW} />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
