// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAwoKAVcj3AjC0YvOReVwCxgoKPd7PElko",
  authDomain: "task-manager-app-amna581.firebaseapp.com",
  projectId: "task-manager-app-amna581",
  storageBucket: "task-manager-app-amna581.firebasestorage.app",
  messagingSenderId: "605376689367",
  appId: "1:605376689367:web:9b302b27c4c46b86762c92"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication
export const auth = getAuth(app);

// Initialize Cloud Firestore
export const db = getFirestore(app);

export default app;