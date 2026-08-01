// roles — single source of truth for account roles and the access level each grants.
// Used by both the auth gate (canManage) and the account UI so they never drift.

const MANAGED_ROLES = ["Supervisor", "Operator", "Dispatcher"];
const VIEW_ONLY_ROLES = ["Viewer", "Observer"];
export const ROLE_OPTIONS = [...MANAGED_ROLES, ...VIEW_ONLY_ROLES];

// isViewOnlyRole — true for read-only roles. Unknown/blank roles default to
// managed (false) so existing accounts keep full capability.
export function isViewOnlyRole(role) {
  return /^\s*(viewer|observer|read[\s-]?only|guest)\s*$/i.test(String(role || ""));
}
