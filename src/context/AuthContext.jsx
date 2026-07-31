import { useEffect, useState } from "react";
import { changeFirebasePassword, createFirebaseAccount, loginWithEmail, logoutFirebase, observeFirebaseAuth, sendFirebasePasswordReset } from "../firebase/auth";
import { auth, firebaseConfigError, firebaseConfigured } from "../firebase/config";
import { getUserProfile, saveUserProfile, updateUserProfile } from "../firebase/firestore";
import { passwordMeetsPolicy } from "../utils/password";
import { isViewOnlyRole } from "../utils/roles";
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
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function writeLocalUsers(users) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

function readLoginGuard() {
  try {
    return JSON.parse(localStorage.getItem(LOGIN_GUARD_KEY)) || { count: 0, lockedUntil: 0 };
  } catch {
    return { count: 0, lockedUntil: 0 };
  }
}

function clearLoginGuard() {
  localStorage.removeItem(LOGIN_GUARD_KEY);
}

function registerFailedLogin() {
  const guard = readLoginGuard();
  const count = Number(guard.count || 0) + 1;
  const lockedUntil = count >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0;
  localStorage.setItem(LOGIN_GUARD_KEY, JSON.stringify({ count, lockedUntil }));
}

function lockoutMessage(lockedUntil) {
  const seconds = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000));
  return `Too many failed attempts. Try again in ${seconds} seconds.`;
}

// Returns whichever storage currently holds the session, defaulting to localStorage.
function activeSessionStore() {
  return sessionStorage.getItem(SESSION_KEY) ? sessionStorage : localStorage;
}

function saveSession(user, remember) {
  const store = remember ? localStorage : sessionStorage;
  const other = remember ? sessionStorage : localStorage;
  store.setItem(SESSION_KEY, JSON.stringify(user));
  other.removeItem(SESSION_KEY);
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
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY));
    } catch {
      return null;
    }
  });
  const [authReady, setAuthReady] = useState(!firebaseConfigured || !auth);
  const [authError, setAuthError] = useState(firebaseConfigError);
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
        activeSessionStore().setItem(SESSION_KEY, JSON.stringify(nextUser));
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

    if (!firebaseConfigured && normalizedEmail === demoUser.email && password === "admin123") {
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
            setAuthMessage("Logged in with Firebase.");
          }
          return true;
        }
      } catch (error) {
        registerFailedLogin();
        setAuthError(describeAuthError(error));
        return false;
      }
    } else {
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
    setAuthError(firebaseConfigured ? "Invalid Firebase credentials." : "Invalid credentials. Demo: admin@smartchestminer.io / admin123");
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
            setAuthMessage("Firebase account created successfully.");
          }
          return true;
        }
      } catch (error) {
        if (error.code === "auth/email-already-in-use") {
          setAuthError("This email already exists in Firebase Authentication. Use Log In, and the app will create the missing Firestore profile automatically.");
        } else {
          setAuthError(describeAuthError(error));
        }
        return false;
      }
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
    const nextUser = { ...user, ...patch };
    setUser(nextUser);
    activeSessionStore().setItem(SESSION_KEY, JSON.stringify(nextUser));
    if (user.source === "firebase" && user.uid) {
      updateUserProfile(user.uid, {
        name: nextUser.name,
        email: nextUser.email,
        role: nextUser.role || null,
        photoURL: nextUser.photoURL || null,
      }).catch((error) => setAuthError(error.message));
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
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
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
    "invalid-credential": "Firebase rejected these credentials. Check the email and password, and confirm Email/Password sign-in is enabled.",
    "invalid-login-credentials": "Firebase rejected these credentials. Check the email and password, and confirm Email/Password sign-in is enabled.",
    "user-not-found": "No Firebase account exists for this email.",
    "wrong-password": "The Firebase password is incorrect.",
    "user-disabled": "This Firebase account has been disabled.",
    "operation-not-allowed": "Email/Password sign-in is disabled in Firebase Authentication.",
    "network-request-failed": "Firebase could not be reached. Check the network, Firebase project, and authorized domain.",
    "invalid-api-key": "The Firebase API key is invalid. Check the VITE_FIREBASE_* values used during the build.",
    "app-not-authorized": "This domain is not authorized in Firebase Authentication settings.",
    "too-many-requests": "Firebase temporarily blocked requests from this device. Try again later.",
  };
  return messages[code] || error?.message || "Authentication failed. Check the Firebase configuration and account details.";
}
