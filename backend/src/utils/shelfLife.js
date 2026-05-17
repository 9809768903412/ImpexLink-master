const DAYS = {
  sixMonths: 183,
  oneYear: 365,
  eighteenMonths: 548,
  twoYears: 730,
  threeYears: 1095,
  fiveYears: 1825,
  tenYears: 3650,
};

function includesAny(value, terms) {
  return terms.some((term) => value.includes(term));
}

function resolveShelfLifeDays({ itemName = '', categoryName = '', unit = '', shelfLifeDays } = {}) {
  const explicit = Number(shelfLifeDays);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const name = String(itemName).toLowerCase();
  const category = String(categoryName).toLowerCase();
  const unitValue = String(unit).toLowerCase();

  if (includesAny(name, ['thinner', 'solvent', 'lacquer', 'mineral spirits', 'acetone', 'xylene'])) {
    return DAYS.threeYears;
  }

  if (includesAny(name, ['epoxy', 'ceramic tech', 'cerami-tech', 'metal tech', 'metal-tech', 'seal tech', 'seal-tech', 'vapor ban'])) {
    return DAYS.twoYears;
  }

  if (includesAny(name, ['latex', 'acrylic caulk', 'silicone', 'latasil'])) {
    return DAYS.eighteenMonths;
  }

  if (includesAny(name, ['paint', 'coating', 'primer', 'enamel']) && !includesAny(name, ['brush', 'roller'])) {
    return DAYS.threeYears;
  }

  if (includesAny(name, ['cement', 'mortar', 'grout', 'waterproofing', 'membrane'])) {
    return DAYS.twoYears;
  }

  if (includesAny(name, ['chopped strand', 'poly tech', 'poly-tech', 'fiberglass', 'strand matt'])) {
    return DAYS.fiveYears;
  }

  if (includesAny(name, ['brush', 'roller', 'sand paper', 'sandpaper', 'spatula', 'palette', 'steel brush', 'rags', 'sacks'])) {
    return DAYS.fiveYears;
  }

  if (category.includes('machinery') || includesAny(unitValue, ['unit', 'set'])) {
    return DAYS.tenYears;
  }

  if (category.includes('construction chemical')) {
    return DAYS.twoYears;
  }

  if (category.includes('paint')) {
    return DAYS.threeYears;
  }

  return DAYS.twoYears;
}

module.exports = { DAYS, resolveShelfLifeDays };
