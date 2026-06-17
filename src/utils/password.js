import { C } from "../theme";

// password — single source of truth for the account password policy. Shared by
// sign-up (LoginPage), the in-app password change (Navbar), and the auth backstop
// (AuthContext) so the rules can never drift between screens.

// passwordRequirements — checklist of rules with a met flag for each.
export function passwordRequirements(password) {
  const value = String(password || "");
  return [
    { label: "8+ characters", met: value.length >= 8 },
    { label: "Uppercase letter", met: /[A-Z]/.test(value) },
    { label: "Lowercase letter", met: /[a-z]/.test(value) },
    { label: "Number or symbol", met: /[\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(value) },
  ];
}

// passwordMeetsPolicy — true when every requirement is satisfied.
export function passwordMeetsPolicy(password) {
  return passwordRequirements(password).every((rule) => rule.met);
}

// passwordStrength — score (1–4) with a label and color for the strength meter.
export function passwordStrength(password) {
  const score = passwordRequirements(password).filter((rule) => rule.met).length;
  if (score <= 1) return { score: 1, color: C.red, label: "Weak" };
  if (score === 2) return { score: 2, color: C.amber, label: "Fair" };
  if (score === 3) return { score: 3, color: C.primary, label: "Good" };
  return { score: 4, color: C.green, label: "Strong" };
}
