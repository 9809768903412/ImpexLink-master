// Native month inputs can emit partial/oversized years while the user types.
export function getAuditDateRange(month: string, day?: Date) {
  if (month) {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
    if (!match || Number(match[1]) === 0) return {};
    const start = new Date(0);
    start.setFullYear(Number(match[1]), Number(match[2]) - 1, 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    end.setMilliseconds(-1);
    return { dateFrom: start.toISOString(), dateTo: end.toISOString() };
  }
  if (!day || !Number.isFinite(day.getTime())) return {};
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setMilliseconds(-1);
  return { dateFrom: start.toISOString(), dateTo: end.toISOString() };
}

export function getAuditCalendarRange(from?: Date, to?: Date) {
  if (!from || !Number.isFinite(from.getTime()) || (to && (!Number.isFinite(to.getTime()) || to < from))) return {};
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to || from);
  end.setHours(23, 59, 59, 999);
  return { dateFrom: start.toISOString(), dateTo: end.toISOString() };
}
