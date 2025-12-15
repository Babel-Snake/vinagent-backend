import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyA8ntqj81rLMP_QTBH8r7npRpf6MtI2uPY",
    authDomain: "vinagent-9f2e4.firebaseapp.com",
    projectId: "vinagent-9f2e4",
    storageBucket: "vinagent-9f2e4.firebasestorage.app",
    messagingSenderId: "972788381246",
    appId: "1:972788381246:web:0b7cc5e277b671045d036f"
};

// Initialize Firebase (Singleton pattern)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

export { app, auth };
