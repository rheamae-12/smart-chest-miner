import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { firestoreDb } from "./config";

export async function getUserProfile(uid) {
  if (!firestoreDb || !uid) return null;
  const snapshot = await getDoc(doc(firestoreDb, "users", uid));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function saveUserProfile(uid, profile) {
  if (!firestoreDb || !uid) return false;
  await setDoc(
    doc(firestoreDb, "users", uid),
    {
      ...profile,
      updatedAt: serverTimestamp(),
      createdAt: profile.createdAt || serverTimestamp(),
    },
    { merge: true },
  );
  return true;
}

export async function updateUserProfile(uid, patch) {
  if (!firestoreDb || !uid) return false;
  await updateDoc(doc(firestoreDb, "users", uid), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
  return true;
}
