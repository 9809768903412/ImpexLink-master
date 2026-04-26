function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isEmail(value) {
  if (!isNonEmptyString(value)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isNonNegativeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0;
}

function isPositiveInt(value) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0;
}

function isValidDateString(value) {
  return Boolean(value) && !Number.isNaN(Date.parse(String(value)));
}

module.exports = {
  isNonEmptyString,
  isEmail,
  isNonNegativeNumber,
  isPositiveInt,
  isValidDateString,
};
