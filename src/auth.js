import { initializeApp } from 'firebase/app';
import { getAuth,GoogleAuthProvider,signInWithPopup,signInWithEmailAndPassword,onAuthStateChanged,setPersistence,browserSessionPersistence,signOut,sendPasswordResetEmail } from 'firebase/auth';
let auth;
export function configureAuth(){if(!import.meta.env.VITE_FIREBASE_API_KEY)return null;const app=initializeApp({apiKey:import.meta.env.VITE_FIREBASE_API_KEY,authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID});auth=getAuth(app);return auth;}
export const observe=callback=>onAuthStateChanged(auth,callback);
export async function loginGoogle(){await setPersistence(auth,browserSessionPersistence);return signInWithPopup(auth,new GoogleAuthProvider());}
export async function loginEmail(email,password){await setPersistence(auth,browserSessionPersistence);return signInWithEmailAndPassword(auth,email,password);}
export const logout=()=>auth?signOut(auth):Promise.resolve();
export const resetPassword=email=>sendPasswordResetEmail(auth,email);
