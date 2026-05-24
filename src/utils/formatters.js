export function timeLabel(date = new Date()) {
  return formatSystemTimestamp(date);
}

export function formatSystemTimestamp(value = new Date()) {
  if (!value) return "NEVER";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "UNKNOWN";

  const month = date.toLocaleString("en-US", { month: "long" }).toUpperCase();
  const day = date.getDate().toString().padStart(2, "0");
  const year = date.getFullYear();
  const time = date.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
  return `${month} ${day}, ${year} - ${time}`;
}

export function formatLastSeen(value) {
  return formatSystemTimestamp(value);
}

export function formatReading(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "--";
  return number.toFixed(digits);
}

export function average(values, digits = 1) {
  const valid = values.filter((value) => Number.isFinite(value) && value > 0);
  if (valid.length === 0) return 0;
  return Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(digits));
}
