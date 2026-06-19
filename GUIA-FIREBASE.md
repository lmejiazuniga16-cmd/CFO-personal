# Guía: poner tu app a funcionar (gratis, en 10 minutos)

Esta app necesita una base de datos en la nube para que lo que registres en el celular se vea en el computador al instante, y viceversa. Vamos a usar **Firebase** (de Google), que es gratis para tu volumen de uso.

## Paso 1 — Crear el proyecto en Firebase

1. Entra a https://console.firebase.google.com
2. Inicia sesión con tu cuenta de Google (o crea una)
3. Clic en **"Crear un proyecto"**
4. Ponle un nombre, ej: `cfo-personal-marcela`
5. Desactiva Google Analytics (no lo necesitas) y clic en **"Crear proyecto"**

## Paso 2 — Activar autenticación

1. En el menú izquierdo, ve a **Compilación → Authentication**
2. Clic en **"Comenzar"**
3. Selecciona **"Correo electrónico/contraseña"**
4. Activa el primer interruptor y clic en **"Guardar"**

## Paso 3 — Activar la base de datos (Firestore)

1. En el menú izquierdo, ve a **Compilación → Firestore Database**
2. Clic en **"Crear base de datos"**
3. Elige la ubicación **`southamerica-east1`** (São Paulo, la más cercana a Colombia)
4. Selecciona **"Iniciar en modo de producción"**
5. Clic en **"Habilitar"**

## Paso 4 — Configurar las reglas de seguridad

Esto es importante: sin esto, cualquiera podría leer o borrar tus datos.

1. Dentro de Firestore Database, ve a la pestaña **"Reglas"**
2. Borra todo y pega esto:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

3. Clic en **"Publicar"**

Esto garantiza que cada persona solo puede ver y modificar sus propios datos.

## Paso 5 — Conectar la app con tu proyecto

1. En Firebase, clic en el ícono de engranaje (⚙️) junto a "Descripción del proyecto" → **"Configuración del proyecto"**
2. Bájale hasta **"Tus apps"** y clic en el ícono **`</>`** (Web)
3. Ponle un apodo, ej: `app-web`, y clic en **"Registrar app"** (NO necesitas activar Hosting)
4. Firebase te muestra un bloque de código como este:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "cfo-personal-marcela.firebaseapp.com",
  projectId: "cfo-personal-marcela",
  storageBucket: "cfo-personal-marcela.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

5. Copia esos 6 valores
6. Abre el archivo **`firebase-config.js`** de tu app y reemplaza el objeto `firebaseConfig` con el tuyo (manteniendo las comillas)

## Paso 6 — Subir la app para usarla en el celular y el computador

La forma más simple y gratis es con **GitHub Pages** o **Netlify Drop**:

### Opción rápida: Netlify Drop (sin cuenta, 2 minutos)
1. Entra a https://app.netlify.com/drop
2. Arrastra la carpeta completa de tu app (con index.html, app.js, firebase-config.js, manifest.json) a la página
3. Netlify te da un link público (ej: `https://cfo-marcela-123.netlify.app`)
4. Abre ese link en tu celular y en tu computador — ¡ya está sincronizado!

### Para instalarla como app en el celular (Android/iPhone)
1. Abre el link en Chrome (Android) o Safari (iPhone)
2. Toca el menú (⋮ o ícono de compartir)
3. Selecciona **"Agregar a pantalla de inicio"** / **"Añadir a inicio"**
4. Listo — queda como un ícono más, sin necesidad de tienda de apps

## Paso 7 — Crear tu cuenta dentro de la app

1. Abre la app (en el link de Netlify)
2. En la pantalla de entrada, toca **"Crear cuenta"**
3. Pon tu correo y una contraseña
4. Al crear la cuenta, la app precarga automáticamente tus deudas, ahorros y el resumen financiero que me enviaste — no tienes que digitar nada de eso

Desde ese momento, todo lo que registres se guarda en la nube y aparece igual en cualquier dispositivo donde entres con esa misma cuenta.

---

### ¿Cuánto cuesta esto?
Nada. El plan gratuito de Firebase ("Spark") incluye 50.000 lecturas y 20.000 escrituras de base de datos al día — tu uso personal está muy por debajo de eso (estaríamos hablando de decenas de registros al día, no miles).

### ¿Y si quiero que te ayude a hacer estos pasos?
Dime en cuál te quedaste y seguimos desde ahí.
