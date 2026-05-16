import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: cleanEnv(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: cleanEnv(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  databaseURL: cleanEnv(import.meta.env.VITE_FIREBASE_DATABASE_URL),
  projectId: cleanEnv(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  appId: cleanEnv(import.meta.env.VITE_FIREBASE_APP_ID),
};
export const firebaseDatabaseUrl = cleanEnv(import.meta.env.VITE_FIREBASE_DATABASE_URL);
export const firebaseDatabaseSecret = cleanEnv(import.meta.env.VITE_FIREBASE_DATABASE_SECRET);

function cleanEnv(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function hasFirebaseValue(value) {
  return Boolean(value && !String(value).includes("your_") && String(value).trim() !== "");
}

export const firebaseConfigured = Object.values(firebaseConfig).every(hasFirebaseValue);
export let firebaseConfigError = "";
export let app = null;
export let auth = null;
export let db = null;
export let firestoreDb = null;

if (firebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    firestoreDb = getFirestore(app);

    try {
      db = getDatabase(app);
    } catch (error) {
      firebaseConfigError = `Realtime Database setup failed: ${error.message}`;
      db = null;
    }
  } catch (error) {
    firebaseConfigError = `Firebase setup failed: ${error.message}`;
    app = null;
    auth = null;
    db = null;
    firestoreDb = null;
  }
}
