import { Alert } from "@/shared/ui";

import { COPY } from "./copy";

/** RF-32: hiện tối đa 3 mã đơn, phần còn lại "và {n} đơn khác". */
const SHOWN = 3;

/**
 * Kiện gộp nhiều đơn (FR-05.22, EX-T3; 01 §10.4 S2): banner vàng "Kiện gộp {n} đơn: …0123, …0456 — kiểm đủ hàng của
 * cả hai". `orders` = mã đơn chính + `merged_orders`; < 2 đơn → không hiện.
 */
export function MergedOrdersBanner({ orders }: { orders: string[] }) {
  if (orders.length < 2) return null;
  const list = orders.slice(0, SHOWN).map(COPY.packing.orderTail).join(", ");
  return (
    <div role="alert">
      <Alert kind="warning">
        <span className="text-headline-sm">
          {COPY.packing.merged(orders.length, list, orders.length - SHOWN)}
        </span>
      </Alert>
    </div>
  );
}
