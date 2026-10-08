import { wsHandlers } from "../ws";
import { approvalsHandlers } from "./approvals";
import { authHandlers } from "./auth";
import { backupHandlers } from "./backup";
import { claimsHandlers } from "./claims";
import { clipsHandlers } from "./clips";
import { importsHandlers } from "./imports";
import { notifyHandlers } from "./notify";
import { packagesHandlers } from "./packages";
import { reconHandlers } from "./recon";
import { reportsHandlers } from "./reports";
import { returnsHandlers } from "./returns";
import { settingsHandlers } from "./settings";
import { sharesHandlers } from "./shares";
import { shopsHandlers } from "./shops";
import { stationHandlers } from "./station";
import { stationsHandlers } from "./stations";
import { usersHandlers } from "./users";

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
  ...usersHandlers,
  // item 02 (T-151)
  ...returnsHandlers,
  ...reconHandlers,
  ...claimsHandlers,
  // item 03 (T-251)
  ...sharesHandlers,
  ...notifyHandlers,
  ...backupHandlers,
  ...wsHandlers,
];
