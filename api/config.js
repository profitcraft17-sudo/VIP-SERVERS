const dotenv = require('dotenv');
const { initializeApp, getApps, getApp } = require("firebase/app");

dotenv.config();

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

// Singleton pattern: server crash hone se bachata hai
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

module.exports = app;
