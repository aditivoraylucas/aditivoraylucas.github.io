import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBc7jh4dai3OZIriKdFxguI44A73TRKYTI",
  authDomain: "cronograma-pro-ray.firebaseapp.com",
  projectId: "cronograma-pro-ray",
  storageBucket: "cronograma-pro-ray.firebasestorage.app",
  messagingSenderId: "358433192984",
  appId: "1:358433192984:web:5af60313307f9bfadc176d"
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
