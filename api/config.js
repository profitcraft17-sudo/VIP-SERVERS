const { initializeApp, getApps, getApp } = require("firebase/app");

const firebaseConfig = {
    apiKey: "AiZaSyDSHiNVzkloQa2j3bMsT0rm...", // Aapki complete key yahan rahegi
    authDomain: "vip-servers-d9788.firebaseapp.com",
    databaseURL: "https://vip-servers-d9788-default-rtdb.firebaseio.com", 
    projectId: "vip-servers-d9788",
    storageBucket: "vip-servers-d9788.appspot.com",
    messagingSenderId: "43489242493",
    appId: "1:43489242493:web:b582518bc6399cee93b014",
    measurementId: "G-NE3H5W1CD4"
};

// Singleton pattern: bina env ke bhi crash hone se bachayega
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

module.exports = app;
