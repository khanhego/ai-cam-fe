import { useEffect, useState } from "react";

import { useStationStore } from "./stationStore";

/** Giờ hiện tại theo server (`server_time` trong API-10) — station hiển thị đồng hồ đúng giờ server. */
export function useServerNow(intervalMs = 1000): number {
  const offset = useStationStore((s) => s.clockOffsetMs);
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), intervalMs);
    return () => clearInterval(id);
  }, [offset, intervalMs]);
  return now;
}

export const mmss = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

export const hhmmss = (ms: number) =>
  new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(ms));
