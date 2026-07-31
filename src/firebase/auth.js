import { EmailAuthProvider, createUserWithEmailAndPassword, onAuthStateChanged, reauthenticateWithCredential, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updatePassword, updateProfile } from "firebase/auth";
import { auth } from "./config";

export function observeFirebaseAuth(onUser) {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, onUser);
}

export async function loginWithEmail(email, password) {
  if (!auth) throw new Error("Firebase Authentication is not configured. Add the VITE_FIREBASE_* values to .env and rebuild.");
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function createFirebaseAccount({ name, email, password }) {
  if (!auth) throw new Error("Firebase Authentication is not configured. Add the VITE_FIREBASE_* values to .env and rebuild.");
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (name) {
    await updateProfile(credential.user, { displayName: name });
  }
  return credential.user;
}

export async function logoutFirebase() {
  if (!auth) return;
  await signOut(auth);
}

// sendFirebasePasswordReset — emails a reset link for a Firebase account.
export async function sendFirebasePasswordReset(email) {
  if (!auth) throw new Error("Firebase authentication is not configured.");
  await sendPasswordResetEmail(auth, email);
}

// changeFirebasePassword — reauthenticates with current password then sets a new one
export async function changeFirebasePassword(currentPassword, newPassword) {
  if (!auth?.currentUser) throw new Error("No active Firebase session.");
  const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
  await reauthenticateWithCredential(auth.currentUser, credential);
  await updatePassword(auth.currentUser, newPassword);
}
