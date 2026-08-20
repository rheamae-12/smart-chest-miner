import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: cleanEnv(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: cleanEnv(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  databaseURL: cleanEnv(import.meta.env.VITE_FIREBASE_DATABASE_URL),
  projectId: cleanEnv(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  appId: cleanEnv(import.meta.env.VITE_FIREBASE_APP_ID),
};
export const firebaseDatabaseUrl = cleanEnv(import.meta.env.VITE_FIREBASE_DATABASE_URL);

function cleanEnv(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function hasFirebaseValue(value) {
  return Boolean(value && !String(value).includes("your_") && String(value).trim() !== "");
}

export const firebaseConfigured = Object.values(firebaseConfig).every(hasFirebaseValue);

function initializeFirebaseServices() {
  const services = { firebaseConfigError: "", app: null, auth: null, db: null, firestoreDb: null };
  if (!firebaseConfigured) return services;
  try {
    services.app = initializeApp(firebaseConfig);
    services.auth = getAuth(services.app);
    services.firestoreDb = getFirestore(services.app);
    try {
      services.db = getDatabase(services.app);
    } catch (error) {
      services.firebaseConfigError = `Realtime Database setup failed: ${error.message}`;
    }
  } catch (error) {
    services.firebaseConfigError = `Firebase setup failed: ${error.message}`;
  }
  return services;
}

const firebaseServices = initializeFirebaseServices();
export const { firebaseConfigError, app, auth, db, firestoreDb } = firebaseServices;
