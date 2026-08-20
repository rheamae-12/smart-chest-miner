export function isValidEmail(value) {
  const parts = String(value || "").trim().split("@");
  if (parts.length !== 2) return false;
  const [localPart, domainPart] = parts;
  return Boolean(localPart && domainPart && domainPart.includes(".") && !domainPart.startsWith(".") && !domainPart.endsWith("."));
}
