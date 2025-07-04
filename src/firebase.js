// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyAwoKAVcj3AjC0YvOReVwCxgoKPd7PElko",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "task-manager-app-amna581.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "task-manager-app-amna581",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "task-manager-app-amna581.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "605376689367",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:605376689367:web:9b302b27c4c46b86762c92"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication
export const auth = getAuth(app);

// Initialize Cloud Firestore
export const db = getFirestore(app);

export default app;