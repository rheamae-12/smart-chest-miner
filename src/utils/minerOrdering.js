export function compareMinersActiveFirst(a, b) {
  const rankDifference = activityRank(a) - activityRank(b);
  if (rankDifference) return rankDifference;
  return String(a?.id || "").localeCompare(String(b?.id || ""));
}

export function sortMinersActiveFirst(miners = []) {
  return [...miners].sort(compareMinersActiveFirst);
}

function activityRank(miner) {
  return miner?.active && !miner?.stale ? 0 : 1;
}
