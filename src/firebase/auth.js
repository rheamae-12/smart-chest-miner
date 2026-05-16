import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, updateProfile } from "firebase/auth";
import { auth } from "./config";

export function observeFirebaseAuth(onUser) {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, onUser);
}

export async function loginWithEmail(email, password) {
  if (!auth) return null;
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function createFirebaseAccount({ name, email, password }) {
  if (!auth) return null;
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
