/** Drawer mobile (02b-admin §9 a11y, review P2-15): focus vào drawer, Tab vòng trong drawer, Esc đóng, trả focus về nút menu. */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { login } from "@/lib/api/auth";
import { renderApp } from "@/test/render";

test("P2-15: mở drawer → focus mục đầu; Tab vòng trong drawer; Esc đóng và trả focus về Mở menu", async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");
  const user = userEvent.setup();
  renderApp("/admin");

  const menu = await screen.findByRole("button", { name: "Mở menu" });
  await user.click(menu);
  const drawer = screen.getByRole("dialog", { name: "Menu" });
  const links = within(drawer).getAllByRole("link");
  await waitFor(() => expect(links[0]).toHaveFocus());

  // Tab từ mục cuối → về phần tử đầu của drawer (nút Đóng menu), không ra ngoài trang.
  links.at(-1)!.focus();
  await user.tab();
  expect(within(drawer).getByRole("button", { name: "Đóng menu" })).toHaveFocus();
  await user.tab({ shift: true });
  expect(links.at(-1)).toHaveFocus();

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument();
  expect(menu).toHaveFocus();
});
