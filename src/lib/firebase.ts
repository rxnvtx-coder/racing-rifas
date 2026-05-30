import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAWboMTh2vTXChmB8sE_ADmjRhVQcayJlQ",
  authDomain: "racing-rifas.firebaseapp.com",
  projectId: "racing-rifas",
  storageBucket: "racing-rifas.firebasestorage.app",
  messagingSenderId: "58560401744",
  appId: "1:58560401744:web:bea01156f89acb16ac9c55",
  measurementId: "G-L9C2BRQVFY"
};

// Initialize Firebase without duplicating instances during hot reloads
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

export { app, db };
