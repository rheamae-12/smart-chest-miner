export function timeLabel(date = new Date()) {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date
    .getSeconds()
    .toString()
    .padStart(2, "0")}`;
}

export function formatLastSeen(value) {
  if (!value) return "Never";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.round(diff / 60000)} min ago`;
  return date.toLocaleString();
}

export function average(values) {
  const valid = values.filter((value) => Number.isFinite(value) && value > 0);
  if (valid.length === 0) return 0;
  return Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}
