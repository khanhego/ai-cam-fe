import { wsHandlers } from "../ws";
import { authHandlers } from "./auth";
import { clipsHandlers } from "./clips";
import { packagesHandlers } from "./packages";
import { reportsHandlers } from "./reports";
import { stationHandlers } from "./station";
import { stationsHandlers } from "./stations";

/** Handler MSW theo contract 02 §6 — thêm theo từng task (DEC-19). */
export const handlers = [
  ...authHandlers,
  ...stationHandlers,
  ...stationsHandlers,
  ...reportsHandlers,
  ...packagesHandlers,
  ...clipsHandlers,
  ...wsHandlers,
];
