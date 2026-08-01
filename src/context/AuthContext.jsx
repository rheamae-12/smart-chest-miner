import { useEffect, useState } from "react";
import { changeFirebasePassword, createFirebaseAccount, loginWithEmail, logoutFirebase, observeFirebaseAuth, sendFirebasePasswordReset } from "../firebase/auth";
import { auth, firebaseConfigError, firebaseConfigured } from "../firebase/config";
import { getUserProfile, saveUserProfile, updateUserProfile } from "../firebase/firestore";
import { passwordMeetsPolicy } from "../utils/password";
import { isViewOnlyRole } from "../utils/roles";
import { readStoredValue, removeStoredValue, reportNonFatal, writeStoredValue } from "../utils/safeStorage";
import { AuthContext } from "./authContextValue";

const demoUser = {
  name: "Admin",
  email: "admin@smartchestminer.io",
  source: "demo",
};
const STORAGE_KEY = "smart-chest-miner-users";
const SESSION_KEY = "smart-chest-miner-session";
const LOGIN_GUARD_KEY = "smart-chest-miner-login-guard";
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 60000;
const HASH_VERSION = 2;
// Local/demo authentication is useful for development only. A production
// build with missing Firebase configuration must fail closed instead of
// exposing a predictable browser-only account.
const localAuthEnabled = import.meta.env.DEV && !firebaseConfigured;

async function hashPassword(password) {
  const data = new TextEncoder().encode(String(password));
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function passwordMatches(input, stored, storedVersion) {
  if (storedVersion === HASH_VERSION) {
    return (await hashPassword(input)) === stored;
  }
  return stored === input;
}

function readLocalUsers() {
  const users = readStoredValue(STORAGE_KEY, []);
  return Array.isArray(users) ? users : [];
}

function writeLocalUsers(users) {
  return writeStoredValue(STORAGE_KEY, users);
}

function readLoginGuard() {
  const guard = readStoredValue(LOGIN_GUARD_KEY, { count: 0, lockedUntil: 0 });
  return guard && typeof guard === "object" ? guard : { count: 0, lockedUntil: 0 };
}

function clearLoginGuard() {
  removeStoredValue(LOGIN_GUARD_KEY);
}

function registerFailedLogin() {
  const guard = readLoginGuard();
  const count = Number(guard.count || 0) + 1;
  const lockedUntil = count >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0;
  writeStoredValue(LOGIN_GUARD_KEY, { count, lockedUntil });
}

function lockoutMessage(lockedUntil) {
  const seconds = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000));
  return `Too many failed attempts. Try again in ${seconds} seconds.`;
}

// Returns whichever storage currently holds the session, defaulting to localStorage.
function activeSessionStore() {
  return readStoredValue(SESSION_KEY, null, sessionStorage) ? sessionStorage : localStorage;
}

function saveSession(user, remember) {
  const store = remember ? localStorage : sessionStorage;
  const other = remember ? sessionStorage : localStorage;
  writeStoredValue(SESSION_KEY, user, store);
  removeStoredValue(SESSION_KEY, other);
}

async function profileForFirebaseUser(firebaseUser, fallbackName) {
  let existingProfile = null;
  let profileWarning = "";

  try {
    existingProfile = await getUserProfile(firebaseUser.uid);
  } catch (error) {
    profileWarning = `Signed in, but Firestore profile could not be read: ${error.message}`;
  }

  const profile = {
    name: existingProfile?.name || fallbackName || firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "User",
    email: existingProfile?.email || firebaseUser.email,
    ...(existingProfile?.role ? { role: existingProfile.role } : {}),
    ...(existingProfile?.photoURL ? { photoURL: existingProfile.photoURL } : {}),
  };

  if (!existingProfile && !profileWarning) {
    try {
      await saveUserProfile(firebaseUser.uid, profile);
    } catch (error) {
      profileWarning = `Signed in, but Firestore profile could not be saved: ${error.message}`;
    }
  }

  return {
    uid: firebaseUser.uid,
    ...profile,
    source: "firebase",
    profileWarning,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    return readStoredValue(SESSION_KEY, null) || readStoredValue(SESSION_KEY, null, sessionStorage);
  });
  const [authReady, setAuthReady] = useState(!firebaseConfigured || !auth);
  const [authError, setAuthError] = useState(firebaseConfigError ? "Authentication service is unavailable. Contact an administrator." : "");
  const [authMessage, setAuthMessage] = useState("");

  useEffect(() => {
    if (!firebaseConfigured) return undefined;
    if (!auth) return undefined;

    return observeFirebaseAuth(async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          const store = activeSessionStore();
          const storedSession = JSON.parse(store.getItem(SESSION_KEY) || "null");
          setUser(storedSession?.source === "firebase" ? null : storedSession);
          setAuthReady(true);
          return;
        }

        const nextUser = await profileForFirebaseUser(firebaseUser);
        setUser(nextUser);
        // Preserve whichever storage the user chose at login.
        writeStoredValue(SESSION_KEY, nextUser, activeSessionStore());
        if (nextUser.profileWarning) setAuthError(nextUser.profileWarning);
      } catch (error) {
        setAuthError(error.message);
      } finally {
        setAuthReady(true);
      }
    });
  }, []);

  const login = async (email, password, remember = true) => {
    setAuthError("");
    setAuthMessage("");
    const normalizedEmail = email.trim().toLowerCase();
    const guard = readLoginGuard();

    if (guard.lockedUntil && guard.lockedUntil > Date.now()) {
      setAuthError(lockoutMessage(guard.lockedUntil));
      return false;
    }

    if (!firebaseConfigured && !localAuthEnabled) {
      setAuthError(firebaseConfigError || "Authentication service is unavailable. Contact an administrator.");
      return false;
    }

    if (localAuthEnabled && normalizedEmail === demoUser.email && password === "admin123") {
      clearLoginGuard();
      setUser(demoUser);
      saveSession(demoUser, remember);
      return true;
    }

    if (firebaseConfigured) {
      try {
        const firebaseUser = await loginWithEmail(normalizedEmail, password);
        if (firebaseUser) {
          const nextUser = await profileForFirebaseUser(firebaseUser);
          clearLoginGuard();
          setUser(nextUser);
          saveSession(nextUser, remember);
          if (nextUser.profileWarning) {
            setAuthError(nextUser.profileWarning);
          } else {
          setAuthMessage("Signed in successfully.");
          }
          return true;
        }
      } catch (error) {
        registerFailedLogin();
        setAuthError(describeAuthError(error));
        return false;
      }
    } else if (localAuthEnabled) {
      const localUser = readLocalUsers().find((item) => item.email === normalizedEmail);
      if (localUser && await passwordMatches(password, localUser.password, localUser.v)) {
        if (localUser.v !== HASH_VERSION) {
          const hashed = await hashPassword(password);
          writeLocalUsers(readLocalUsers().map((u) => u.email === normalizedEmail ? { ...u, password: hashed, v: HASH_VERSION } : u));
        }
        const nextUser = {
          name: localUser.name,
          email: localUser.email,
          source: "local",
          ...(localUser.role ? { role: localUser.role } : {}),
          ...(localUser.photoURL ? { photoURL: localUser.photoURL } : {}),
        };
        clearLoginGuard();
        setUser(nextUser);
        saveSession(nextUser, remember);
        return true;
      }
    }

    registerFailedLogin();
    setAuthError("Invalid email or password.");
    return false;
  };

  const signUp = async ({ name, email, password }) => {
    setAuthError("");
    setAuthMessage("");

    const normalizedEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    if (!cleanName || !normalizedEmail || !password) {
      setAuthError("Name, email, and password are required.");
      return false;
    }
    if (!passwordMeetsPolicy(password)) {
      setAuthError("Password must be 8+ characters with an uppercase letter, a lowercase letter, and a number or symbol.");
      return false;
    }
    if (normalizedEmail === demoUser.email || readLocalUsers().some((item) => item.email === normalizedEmail)) {
      setAuthError("An account already exists for that email.");
      return false;
    }

    if (firebaseConfigured) {
      try {
        const firebaseUser = await createFirebaseAccount({ name: cleanName, email: normalizedEmail, password });
        if (firebaseUser) {
          const nextUser = await profileForFirebaseUser(firebaseUser, cleanName);
          setUser(nextUser);
          saveSession(nextUser, true);
          if (nextUser.profileWarning) {
            setAuthError(nextUser.profileWarning);
          } else {
          setAuthMessage("Account created successfully.");
          }
          return true;
        }
      } catch (error) {
        if (error.code === "auth/email-already-in-use") {
          setAuthError("This email is already registered. Use Log In to continue.");
        } else {
          setAuthError(describeAuthError(error));
        }
        return false;
      }
    }

    if (!localAuthEnabled) {
      setAuthError(firebaseConfigError || "Authentication service is unavailable. Contact an administrator.");
      return false;
    }

    const newUser = {
      name: cleanName,
      email: normalizedEmail,
      password: await hashPassword(password),
      v: HASH_VERSION,
    };
    writeLocalUsers([...readLocalUsers(), newUser]);
    const nextUser = { name: newUser.name, email: newUser.email, source: "local" };
    setUser(nextUser);
    saveSession(nextUser, true);
    setAuthMessage("Account created successfully.");
    return true;
  };

  const updateUser = (patch) => {
    if (!user) return;
    const safePatch = user.source === "firebase" ? { ...patch, role: user.role } : patch;
    const nextUser = { ...user, ...safePatch };
    setUser(nextUser);
    writeStoredValue(SESSION_KEY, nextUser, activeSessionStore());
    if (user.source === "firebase" && user.uid) {
      updateUserProfile(user.uid, {
        name: nextUser.name,
        email: nextUser.email,
        photoURL: nextUser.photoURL || null,
      }).catch((error) => {
        reportNonFatal(error, "Profile update");
        setAuthError("Profile could not be saved. Check your connection and try again.");
      });
      return;
    }
    const users = readLocalUsers();
    const nextUsers = users.map((item) => (item.email === user.email ? { ...item, ...patch, email: nextUser.email } : item));
    writeLocalUsers(nextUsers);
  };

  // changePassword — verifies current password then updates; works for firebase and local accounts
  const changePassword = async (currentPassword, newPassword) => {
    if (!user) throw new Error("Not signed in.");
    if (user.source === "firebase") {
      await changeFirebasePassword(currentPassword, newPassword);
      return;
    }
    if (user.source === "local") {
      const users = readLocalUsers();
      const match = users.find((u) => u.email === user.email);
      if (!match || !(await passwordMatches(currentPassword, match.password, match.v))) {
        throw new Error("Current password is incorrect.");
      }
      const hashed = await hashPassword(newPassword);
      writeLocalUsers(users.map((u) => (u.email === user.email ? { ...u, password: hashed, v: HASH_VERSION } : u)));
      return;
    }
    throw new Error("Demo accounts cannot change password.");
  };

  const logout = async () => {
    await logoutFirebase();
    setUser(null);
    setAuthError("");
    setAuthMessage("");
    removeStoredValue(SESSION_KEY, localStorage);
    removeStoredValue(SESSION_KEY, sessionStorage);
  };

  // resetPassword — sends a Firebase reset email. Throws if Firebase is not
  // configured (the caller shows the appropriate fallback message).
  const resetPassword = async (email) => {
    await sendFirebasePasswordReset(String(email || "").trim().toLowerCase());
  };

  // canManage — role-based gate for destructive/control actions. Any account is a
  // manager unless its role is explicitly read-only (Viewer/Observer/Read-only).
  // This keeps existing accounts (Supervisor, or no role set) fully capable while
  // letting you provision restricted, view-only operators. See utils/roles.js.
  const canManage = Boolean(user) && !isViewOnlyRole(user?.role);

  const value = { user, authReady, canManage, login, signUp, updateUser, changePassword, resetPassword, logout, authError, authMessage };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function describeAuthError(error) {
  const code = String(error?.code || "").replace(/^auth\//, "");
  const messages = {
    "invalid-credential": "Invalid email or password.",
    "invalid-login-credentials": "Invalid email or password.",
    "user-not-found": "Invalid email or password.",
    "wrong-password": "Invalid email or password.",
    "user-disabled": "This account has been disabled.",
    "operation-not-allowed": "Email and password sign-in is currently unavailable.",
    "network-request-failed": "Unable to reach the sign-in service. Check your connection and try again.",
    "invalid-api-key": "Sign-in service configuration is invalid. Contact an administrator.",
    "app-not-authorized": "This sign-in page is not authorized for the current domain.",
    "too-many-requests": "Too many attempts. Try again later.",
  };
  return messages[code] || error?.message || "Authentication failed. Check your account details and try again.";
}
