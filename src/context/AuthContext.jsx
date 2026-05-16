import { useEffect, useState } from "react";
import { createFirebaseAccount, loginWithEmail, logoutFirebase, observeFirebaseAuth } from "../firebase/auth";
import { firebaseConfigured } from "../firebase/config";
import { getUserProfile, saveUserProfile, updateUserProfile } from "../firebase/firestore";
import { AuthContext } from "./authContextValue";

const demoUser = {
  name: "Admin",
  email: "admin@smartchestminer.io",
  source: "demo",
};
const STORAGE_KEY = "smart-chest-miner-users";

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
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");

  useEffect(() => {
    if (!firebaseConfigured) return undefined;

    return observeFirebaseAuth(async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          setUser(null);
          return;
        }

        const nextUser = await profileForFirebaseUser(firebaseUser);
        setUser(nextUser);
        if (nextUser.profileWarning) setAuthError(nextUser.profileWarning);
      } catch (error) {
        setAuthError(error.message);
      }
    });
  }, []);

  const login = async (email, password) => {
    setAuthError("");
    setAuthMessage("");
    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedEmail === demoUser.email && password === "admin123") {
      setUser(demoUser);
      return true;
    }

    if (firebaseConfigured) {
      try {
        const firebaseUser = await loginWithEmail(normalizedEmail, password);
        if (firebaseUser) {
          const nextUser = await profileForFirebaseUser(firebaseUser);
          setUser(nextUser);
          if (nextUser.profileWarning) {
            setAuthError(nextUser.profileWarning);
          } else {
            setAuthMessage("Logged in with Firebase.");
          }
          return true;
        }
      } catch (error) {
        setAuthError(error.message);
        return false;
      }
    } else {
      const localUser = readLocalUsers().find((item) => item.email === normalizedEmail && item.password === password);
      if (localUser) {
        setUser({ name: localUser.name, email: localUser.email, source: "local" });
        return true;
      }
    }

    setAuthError("Invalid credentials. Demo: admin@smartchestminer.io / admin123");
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
    if (password.length < 6) {
      setAuthError("Password must be at least 6 characters.");
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
          setAuthError(error.message);
        }
        return false;
      }
    }

    const newUser = {
      name: cleanName,
      email: normalizedEmail,
      password,
    };
    writeLocalUsers([...readLocalUsers(), newUser]);
    setUser({ name: newUser.name, email: newUser.email, source: "local" });
    setAuthMessage("Account created successfully.");
    return true;
  };

  const updateUser = (patch) => {
    if (!user) return;
    const nextUser = { ...user, ...patch };
    setUser(nextUser);
    if (user.source === "firebase" && user.uid) {
      updateUserProfile(user.uid, {
        name: nextUser.name,
        email: nextUser.email,
      }).catch((error) => setAuthError(error.message));
      return;
    }
    const users = readLocalUsers();
    const nextUsers = users.map((item) => (item.email === user.email ? { ...item, ...patch, email: nextUser.email } : item));
    writeLocalUsers(nextUsers);
  };

  const logout = async () => {
    await logoutFirebase();
    setUser(null);
  };

  const value = { user, login, signUp, updateUser, logout, authError, authMessage };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
