import type { Role, SessionUser } from "@/lib/api/session";

import { resetMockApprovals } from "./handlers/approvals";
import { resetMockClaimsHandlers } from "./handlers/claims";
import { resetMockExportRules } from "./handlers/clips";
import { resetMockImports } from "./handlers/imports";
import { resetMockSettings } from "./handlers/settings";
import { resetMockShops } from "./handlers/shops";
import { resetMockReports } from "./handlers/reports";
import { resetMockStations } from "./handlers/stations";
import { resetMockAudit } from "./handlers/users";
import { resetMockPackages } from "./packagesDb";
import { resetMockReturns } from "./returnsDb";
import { resetStationSim } from "./stationSim";

/** Dữ liệu giả theo seed `aicam seed-demo --prefix TST` (04-test-cases §1). Mật khẩu chung: matkhau123. */
export const MOCK_PASSWORD = "matkhau123";

export type MockUser = SessionUser & {
  locked?: boolean;
  disabled?: boolean;
  /** Mật khẩu riêng (tài khoản tạo / đặt lại qua D9); không có → MOCK_PASSWORD. */
  password?: string;
  created_at?: string;
};

const station = (id: string, name: string) => ({ id, name });

const seedUsers = (): MockUser[] => [
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

export const mockUsers: MockUser[] = seedUsers();

export const PERMISSIONS: Record<Role, string[]> = {
  ADMIN: ["*"],
  SUPERVISOR: [
    "packages.read",
    "clips.export",
    "approvals.decide",
    "imports.write",
    "live.read",
    // item 02 (02 §6.1 API-04)
    "returns.read",
    "returns.link",
    "inspection.correct",
    "recon.read",
    "recon.resolve",
    "warehouse_status.adjust",
    "claims.manage",
  ],
  CSKH: ["packages.read", "clips.export", "returns.read", "recon.read", "claims.manage"],
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
  mockUsers.splice(0, mockUsers.length, ...seedUsers());
  resetMockAudit();
  resetStationSim();
  resetMockStations();
  resetMockPackages();
  // Sau packagesDb: ghi phiên RETURN mẫu vào kiện.
  resetMockReturns();
  resetMockClaimsHandlers();
  resetMockReports();
  resetMockApprovals();
  resetMockExportRules();
  resetMockImports();
  resetMockShops();
  resetMockSettings();
}
