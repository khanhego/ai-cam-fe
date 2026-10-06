import { ws } from "msw";

/** Mock WS-01 / WS-02 (02 §6 WS) cho `pnpm dev:mock`: trả pong; `stationWs.broadcast(...)` để giả lập sự kiện. */
export const stationWs = ws.link("ws://*/ws/station");
export const dashboardWs = ws.link("ws://*/ws/dashboard");

const pong = () => JSON.stringify({ type: "pong", data: null, at: new Date().toISOString() });

export const wsHandlers = [
  stationWs.addEventListener("connection", ({ client }) => {
    client.addEventListener("message", (event) => {
      if (typeof event.data === "string" && event.data.includes('"ping"')) client.send(pong());
    });
  }),
  dashboardWs.addEventListener("connection", ({ client }) => {
    client.addEventListener("message", (event) => {
      if (typeof event.data === "string" && event.data.includes('"ping"')) client.send(pong());
    });
  }),
];

/** Phát sự kiện WS-02 cho dashboard (item 02: `return.updated`, `recon.updated`, `claim.updated`, `evidence_pack.updated`). */
export function dashboardEvent(type: string, data: unknown) {
  dashboardWs.broadcast(JSON.stringify({ type, data, at: new Date().toISOString() }));
}
