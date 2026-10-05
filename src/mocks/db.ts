import type { Role, SessionUser } from "@/lib/api/session";

import { resetMockApprovals } from "./handlers/approvals";
import { resetMockExportRules } from "./handlers/clips";
import { resetMockReports } from "./handlers/reports";
import { resetMockStations } from "./handlers/stations";
import { resetMockPackages } from "./packagesDb";
import { resetStationSim } from "./stationSim";

/** Dữ liệu giả theo seed `aicam seed-demo --prefix TST` (04-test-cases §1). Mật khẩu chung: matkhau123. */
export const MOCK_PASSWORD = "matkhau123";

type MockUser = SessionUser & { locked?: boolean; disabled?: boolean };

const station = (id: string, name: string) => ({ id, name });

export const mockUsers: MockUser[] = [
  { id: "u-admin", username: "tst_admin", display_name: "Quản trị", role: "ADMIN", station: null },
  { id: "u-sup", username: "tst_sup", display_name: "Nguyễn B", role: "SUPERVISOR", station: null },
  { id: "u-cskh", username: "tst_cskh", display_name: "Lan", role: "CSKH", station: null },
  {
    id: "u-st1",
    username: "tst_station01",
    display_name: "TST Station 01",
    role: "STATION",
    station: station("st-1", "TST Station 01"),
  },
  {
    id: "u-st2",
    username: "tst_station02",
    display_name: "TST Station 02",
    role: "STATION",
    station: station("st-2", "TST Station 02"),
  },
  {
    id: "u-locked",
    username: "tst_locked",
    display_name: "Bị khóa",
    role: "CSKH",
    station: null,
    locked: true,
  },
  {
    id: "u-off",
    username: "tst_disabled",
    display_name: "Đã tắt",
    role: "CSKH",
    station: null,
    disabled: true,
  },
];

export const PERMISSIONS: Record<Role, string[]> = {
  ADMIN: ["*"],
  SUPERVISOR: ["packages.read", "clips.export", "approvals.decide", "imports.write", "live.read"],
  CSKH: ["packages.read", "clips.export"],
  STATION: ["station.scan"],
};

/** Phiên refresh giả: thay cho cookie httpOnly rt_station / rt_dashboard. */
export const mockRefresh = new Map<"STATION" | "DASHBOARD", string>();

export const tokenFor = (userId: string) => `mock.${userId}.${Date.now()}`;

export function userFromAuth(header: string | null): MockUser | undefined {
  const id = header?.replace(/^Bearer mock\./, "").split(".")[0];
  return mockUsers.find((u) => u.id === id);
}

/** Bỏ trường nội bộ của mock trước khi trả ra API. */
export function publicUser(user: MockUser): SessionUser {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    station: user.station,
  };
}

export function resetMockDb() {
  mockRefresh.clear();
  resetStationSim();
  resetMockStations();
  resetMockPackages();
  resetMockReports();
  resetMockApprovals();
  resetMockExportRules();
}
