type Props = { area: "station" | "admin" };

const TITLES: Record<Props["area"], string> = {
  station: "Station đóng gói",
  admin: "Bảng điều khiển",
};

/** Màn tạm của khung repo (T-30); bị thay ở T-34 / T-50. */
export function ShellPlaceholder({ area }: Props) {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-headline-sm">Hệ thống X</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">{TITLES[area]}</p>
    </main>
  );
}
