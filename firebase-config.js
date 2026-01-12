// ===================================
// Firebase Configuration
// ===================================
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDzFNaCOtrrMVczIjUMAfh-InXjxKYhqdU",
  authDomain: "floridastaterp-1b9c2.firebaseapp.com",
  projectId: "floridastaterp-1b9c2",
  storageBucket: "floridastaterp-1b9c2.firebasestorage.app",
  messagingSenderId: "1071286531174",
  appId: "1:1071286531174:web:733600a43304540c9c69a7",
  measurementId: "G-NWQPCR02LN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Initialize Firebase services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Export Firebase services for use in other files
export { app, analytics, auth, db, storage };

console.log('🔥 Firebase initialized successfully');
