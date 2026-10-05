import { wsHandlers } from "../ws";
import { approvalsHandlers } from "./approvals";
import { authHandlers } from "./auth";
import { clipsHandlers } from "./clips";
import { importsHandlers } from "./imports";
import { packagesHandlers } from "./packages";
import { reportsHandlers } from "./reports";
import { settingsHandlers } from "./settings";
import { shopsHandlers } from "./shops";
import { stationHandlers } from "./station";
import { stationsHandlers } from "./stations";

/** Handler MSW theo contract 02 §6 — thêm theo từng task (DEC-19). */
export const handlers = [
  ...authHandlers,
  ...stationHandlers,
  ...approvalsHandlers,
  ...stationsHandlers,
  ...reportsHandlers,
  ...packagesHandlers,
  ...clipsHandlers,
  ...importsHandlers,
  ...shopsHandlers,
  ...settingsHandlers,
  ...wsHandlers,
];
