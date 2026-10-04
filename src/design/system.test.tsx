import { render, screen } from "@testing-library/react";

test("class của design system dùng được trong component", () => {
  render(
    <div className="card bg-primary text-on-primary text-title-md rounded-md">
      <span className="icon" aria-hidden>
        check_circle
      </span>
      Sẵn sàng
    </div>,
  );

  expect(screen.getByText("Sẵn sàng")).toHaveClass("card", "bg-primary");
});
