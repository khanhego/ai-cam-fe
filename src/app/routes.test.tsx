import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

import { routes } from "./routes";

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

test("gốc chuyển tới /admin", async () => {
  const router = renderAt("/");

  expect(await screen.findByText("Bảng điều khiển")).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/admin");
});

test("khu vực station có màn riêng", async () => {
  renderAt("/station");

  expect(await screen.findByText("Station đóng gói")).toBeInTheDocument();
});
