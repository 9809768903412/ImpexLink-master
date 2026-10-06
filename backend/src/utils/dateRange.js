function dateRangeWhere(query, field) {
  const bounds = {};
  for (const [parameter, operator] of [['dateFrom', 'gte'], ['dateTo', 'lte']]) {
    if (!query[parameter]) continue;
    const value = new Date(String(query[parameter]));
    if (!Number.isFinite(value.getTime())) throw Object.assign(new Error('Invalid date range'), { status: 400 });
    bounds[operator] = value;
  }
  if (bounds.gte && bounds.lte && bounds.gte > bounds.lte) throw Object.assign(new Error('Start date must be before end date'), { status: 400 });
  return Object.keys(bounds).length ? { [field]: bounds } : {};
}
module.exports = { dateRangeWhere };
