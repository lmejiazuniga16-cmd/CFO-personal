// ============================================================
// CONFIGURACIÓN DE FIREBASE
// ============================================================
// Marcela: reemplaza el objeto de abajo con TU configuración real.
// La obtienes en https://console.firebase.google.com
//   1. Crea un proyecto (gratis, plan "Spark")
//   2. Agrega una app web (ícono </>)
//   3. Copia el objeto "firebaseConfig" que te muestra y pégalo aquí
//   4. Activa "Authentication" → método "Correo/contraseña"
//   5. Activa "Firestore Database" → modo producción, región la más cercana (us-east o southamerica-east1)
// Las instrucciones completas paso a paso están en GUIA-FIREBASE.md
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyASlcURh7-_HKfPX0lXi9Y2St9cNdH12Fo",
  authDomain: "cfo-personal-marcela.firebaseapp.com",
  projectId: "cfo-personal-marcela",
  storageBucket: "cfo-personal-marcela.firebasestorage.app",
  messagingSenderId: "1061343471377",
  appId: "1:1061343471377:web:df9fe5e1eaa247f03f8eb0"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
