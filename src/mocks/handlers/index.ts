import { authHandlers } from "./auth";
import { wsHandlers } from "../ws";
import { stationHandlers } from "./station";
import { stationsHandlers } from "./stations";

/** Handler MSW theo contract 02 §6 — thêm theo từng task (DEC-19). */
export const handlers = [...authHandlers, ...stationHandlers, ...stationsHandlers, ...wsHandlers];
