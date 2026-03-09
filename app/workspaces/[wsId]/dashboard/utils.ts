export type PeriodRange = { start: Date; end: Date } | null;

export function getPeriodRange(
  period: string | undefined | null,
  from: string | undefined | null,
  to: string | undefined | null
): PeriodRange {
  if (!period || period === "all") return null;
  if (period === "custom") {
    if (!from || !to) return null;
    const start = new Date(from);
    const end = new Date(to);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (period) {
    case "this_week": {
      const day = now.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const monday = new Date(year, month, now.getDate() + diff, 0, 0, 0, 0);
      return { start: monday, end: now };
    }
    case "this_month": {
      const start = new Date(year, month, 1, 0, 0, 0, 0);
      return { start, end: now };
    }
    case "last_month": {
      const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const end = new Date(year, month, 0, 23, 59, 59, 999);
      return { start, end };
    }
    case "this_quarter": {
      const quarterMonth = Math.floor(month / 3) * 3;
      const start = new Date(year, quarterMonth, 1, 0, 0, 0, 0);
      return { start, end: now };
    }
    case "last_quarter": {
      const quarterMonth = Math.floor(month / 3) * 3;
      const start = new Date(year, quarterMonth - 3, 1, 0, 0, 0, 0);
      const end = new Date(year, quarterMonth - 1, 0, 23, 59, 59, 999);
      return { start, end };
    }
    case "this_year": {
      const start = new Date(year, 0, 1, 0, 0, 0, 0);
      return { start, end: now };
    }
    default:
      return null;
  }
}
