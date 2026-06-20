# CLAUDE.md

Guía para trabajar en este repositorio. Todo el código y la interfaz están en español (es-CO).

## Qué es

**CFO Personal — Marcela** es una app web personal (PWA) para registrar gastos e
ingresos, seguir deudas y planear el camino a "deuda cero". Está hecha a la medida
de una sola usuaria (Marcela): sus deudas, ahorros y resumen financiero vienen
precargados. Los datos se guardan en Firebase y se sincronizan en tiempo real entre
celular y computador.

No usa framework ni build step: son archivos estáticos que se abren directamente en
el navegador (ES modules cargados por `<script type="module">`).

## Sistema de diseño

Tema oscuro premium ("ledger privado"). Las decisiones visuales viven en variables
CSS dentro del `<style>` de `index.html` (`:root`) — cámbialas ahí, no con valores
sueltos:
- **Color:** base `--bg`, superficies `--surface*`, y una paleta semántica:
  `--brand` (esmeralda = flujo/positivo), `--gold` (metas/ahorro), `--red` (peligro),
  `--sky` (progreso).
- **Tipografía:** `--f-display` Bricolage Grotesque (títulos y números grandes),
  `--f-body` Inter (UI), `--f-mono` JetBrains Mono con `tabular-nums` para todos los
  importes (alineación de ledger). Fuentes desde Google Fonts.
- **Iconos:** **Lucide** (paquete vanilla por CDN, no React — la app no usa React).
  En el markup se escriben como `<i data-lucide="nombre">` y se convierten a SVG con
  `window.lucide.createIcons()`. En `app.js`, tras cada render que inyecta `innerHTML`
  hay que llamar `renderIcons()` para convertir los iconos nuevos.
- **Ancho:** una sola columna `--col` (~468px) centrada; en escritorio se enmarca con
  brillos ambientales. Respeta `prefers-reduced-motion` y `:focus-visible`.

## Cómo correrla

No hay `npm install` ni compilación. Para desarrollo local hace falta servir los
archivos por HTTP (los ES modules y el login de Google no funcionan abriendo el
`index.html` con `file://`):

```bash
# desde la carpeta del proyecto, cualquiera de estas:
python -m http.server 8000
npx serve
```

Luego abrir `http://localhost:8000`. Para que el login con Google funcione, el
dominio (`localhost`) debe estar autorizado en Firebase Console → Authentication →
Settings → Authorized domains.

Despliegue: arrastrar la carpeta a Netlify Drop o publicar con GitHub Pages (ver
"Configuración de Firebase" más abajo).

## Estructura

| Archivo                | Rol                                                                    |
|------------------------|-----------------------------------------------------------------------|
| `index.html`           | Toda la UI y los estilos (CSS embebido en `<style>`). Sin CSS externo. |
| `app.js`               | Toda la lógica: auth, datos, render, periodo, donut, modales, simulador. |
| `firebase-config.js`   | Inicializa Firebase y exporta `auth` y `db`. Contiene las claves.      |
| `manifest.json`        | Manifiesto PWA (instalable en pantalla de inicio).                     |
| `assets/icon-*.png`    | Íconos PWA (192/512) usados por el manifest y como favicon.            |

## Arquitectura

- **Auth:** Firebase Authentication con Google (`signInWithPopup`). `onAuthStateChanged`
  controla qué pantalla se muestra (`#auth-screen` vs `#app`).
- **Datos:** Cloud Firestore. Todo cuelga de `users/{uid}/...`:
  - `users/{uid}/debts/{debtId}` — una deuda por documento. Campos: `id`, `nombre`, `saldo`,
    `saldoOriginal`, `cuotaMensual`, `tasaEA`, `cuotasRestantes`, `fechaFin`, `pago`,
    `abonoParcial`, `automaticDebit`, `debitPaymentsPerMonth`, `debitDay1`, `debitAmount1`,
    `debitDay2`, `debitAmount2`, `debitStartDate`, `lastAutoDebitRun`, `color`.
  - `users/{uid}/transactions/{autoId}` — cada gasto/ingreso registrado.
  - `users/{uid}/meta/ahorros`, `meta/perfil`, `meta/categorias` — documentos de configuración.
- **Sincronización en vivo:** las transacciones se escuchan con `onSnapshot`
  (`listenToTransactions`), así cualquier cambio re-renderiza la UI al instante en
  todos los dispositivos. El listener se guarda en `unsubTx` y se cancela al cerrar sesión.
- **Gestión de deudas:**
  - **Deudas automáticas:** si `automaticDebit` es `true`, se procesan automáticamente
    en las fechas y montos especificados (`debitDay1`/`debitAmount1` y opcionalmente
    `debitDay2`/`debitAmount2` si `debitPaymentsPerMonth === 2`). Los débitos vencidos
    se aplican al iniciar sesión con `processAutoDebits()`. Cada débito crea una
    transacción de gasto de categoría "Deuda" y reduce el saldo automáticamente.
  - **Deudas manuales:** si `automaticDebit` es `false`, la usuaria ve un botón
    "Registrar pago del mes" en la tarjeta. Al clickearlo abre un `prompt()` que sugiere
    la cuota mensual. El pago manual crea una transacción y actualiza el saldo.
  - En ambos casos, `renderDebts()` muestra la etiqueta "Débito automático" o "Manual"
    y botón "Editar" que abre el modal de edición de deuda (`openDebtModal`).
- **Editar/eliminar movimientos:** cualquier transacción de la lista (preview de Inicio
  o Historial) es clicable y reabre el mismo modal precargado (`openEditTx`). El estado
  `editingTxId` distingue alta (`addDoc`) de edición (`updateDoc`, solo monto/descripción/
  categoría/fecha — el `tipo` y `creadoEn` se conservan). El botón rojo "Eliminar
  movimiento" hace `deleteDoc` con confirmación. Al editar se oculta el selector
  Gasto↔Ingreso; si la categoría del movimiento ya fue borrada, se reinyecta como opción.
- **Editar deudas:** modal de deuda (`debt-modal-bg`) permite cambiar nombre, saldo,
  cuotas, cuota mensual, tasa, descripción del pago, y activar/configurar débito
  automático. Si es automático, muestra campos para elegir 1 o 2 cuotas al mes, el día
  de cada cuota, el monto, y la fecha de inicio. `saveDebt()` actualiza en Firestore
  y recarga el renderizado.
- **Seed inicial:** la primera vez que un usuario entra (sin deudas en Firestore),
  `seedInitialData` precarga las constantes `DEUDAS_INICIALES`, `AHORROS_INICIALES`
  y el perfil. A partir de ahí los datos viven en Firestore.
- **Persistencia de sesión:** `setPersistence(auth, browserLocalPersistence)` mantiene
  la sesión entre visitas (no hay que reloguearse). Claves de UX en `localStorage`:
  `cfo_sesion_activa` / `cfo_usuario_nombre` (personalizan el loader) y
  `cfo_flujo_oculto` (privacidad del monto del hero).

## Periodo (filtro de fechas)

Inicio e Historial se filtran por un rango de fechas (`periodStart`/`periodEnd`,
ISO `YYYY-MM-DD`). Todo el filtrado es **en cliente** sobre `allTransactions`
(`txInPeriod()`), sin consultas ni índices extra en Firestore. Dos modos:
- `currentMonth` (por defecto): vista completa del mes, suma montos fijos mensuales
  + movimientos registrados (comportamiento original del hero).
- `custom`: cualquier rango elegido; muestra **solo movimientos registrados** en el
  rango (los montos fijos no se prorratean). El hero cambia su etiqueta y cálculo.
Selector: barra `#period-bar` (global, visible solo en home/history) + modal con
atajos y fechas Desde/Hasta. Tras cambiar el periodo se llama `renderAll()`.

## Vistas (SPA por toggle de visibilidad)

Una sola página con cuatro vistas que se muestran/ocultan con la clase `.hide`
(`showView(view)`), navegadas desde la barra inferior:

- `home` — hero con flujo libre del mes, ingresos/gastos/deuda, acciones rápidas, preview de deudas y últimos movimientos.
- `debts` — todas las deudas y la línea de tiempo a "deuda cero".
- `sim` — el simulador "¿Qué hago con esta plata?" y los ahorros inmovilizados.
- `history` — gráfico de gastos por mes, **donut de gastos por categoría con
  porcentajes** (`renderCategoryChart`, SVG con `stroke-dasharray`, respeta el
  periodo) y lista completa de movimientos.

En ambas listas (`home` y `history`) cada movimiento es clicable para editarlo o
eliminarlo (ver "Editar/eliminar movimientos" en Arquitectura).

## Patrones y convenciones

- Los handlers que se invocan desde `onclick` en el HTML se exponen en `window.*`
  (p. ej. `window.openModal`, `window.submitTransaction`, `window.openDebtModal`,
  `window.saveDebt`, `window.registerDebtPayment`, `window.closeDebtModal`,
  `window.toggleDebtAutoFields`). Si agregas un handler nuevo llamado desde el HTML, debe colgarse de `window`.
- Render: funciones `renderX()` que reconstruyen `innerHTML` a partir del estado en
  memoria (`allTransactions`, `debtsState`, `categoriasGasto`, `categoriasIngreso`).
- Formato de moneda: helper `fmt(n)` → pesos colombianos con `toLocaleString("es-CO")`.
- Fechas: ISO `YYYY-MM-DD` como string; `todayISO()` para la fecha de hoy. Los filtros
  por mes usan `fecha.startsWith("YYYY-MM")`.
- Iconos por categoría: `ICON_MAP` (nombre de categoría → nombre de icono Lucide),
  con `DEFAULT_ICON` de respaldo. Helper `catIcon(nombre)` para resolverlo.
- Categorías: editables por la usuaria, persistidas en `meta/categorias` junto con su
  mapa de iconos (`{ gasto, ingreso, iconos }`). El editor incluye un selector de
  iconos Lucide (`ICON_CHOICES`).
- Toasts de feedback: `showToast(msg, isError)`.

## Datos precargados (constantes en app.js)

Constantes al inicio de `app.js`: `DEUDAS_INICIALES`, `AHORROS_INICIALES`,
`HITOS_TIMELINE` (datos reales de la usuaria, aún activos en sus vistas) y los montos
fijos mensuales `GASTOS_FIJOS_MENSUALES`, `DESCUENTOS_NOMINA_DEUDA`,
`INGRESO_NETO_MENSUAL`, `FLUJO_LIBRE_MENSUAL`.

> **Los montos fijos están en `0`** (decisión del usuario: empezar desde cero y
> registrar todo manualmente). Con esto el hero refleja **solo** los movimientos
> registrados. Los valores originales de Marcela quedaron anotados en un comentario
> junto a las constantes por si se quieren restaurar. `FLUJO_LIBRE_MENSUAL` en 0
> hace que el gráfico mensual no marque ningún mes "sobre presupuesto" (sin budget).

## Gestión de deudas: automáticas vs. manuales

### Estructura de una deuda en Firestore

Cada deuda es un documento con campos comunes y campos específicos del tipo:

```js
{
  id: "libranza",
  nombre: "Libranza Banco de Occidente",
  saldo: 20796254,
  saldoOriginal: 20796254,
  cuotaMensual: 698886,
  tasaEA: 13.62,
  cuotasRestantes: 41,
  fechaFin: "2029-11-30",
  pago: "Nómina automática",
  abonoParcial: true,
  color: "blue",
  // Campos de débito automático:
  automaticDebit: false,           // true = automática, false = manual
  debitPaymentsPerMonth: 1,         // 1 o 2 cuotas al mes
  debitDay1: 1,                     // día del mes de la cuota 1
  debitAmount1: 698886,             // monto de la cuota 1
  debitDay2: 15,                    // día del mes de la cuota 2 (solo si hay 2)
  debitAmount2: 0,                  // monto de la cuota 2
  debitStartDate: null,             // fecha de inicio (ISO YYYY-MM-DD)
  lastAutoDebitRun: null            // fecha del último débito procesado
}
```

### Flujo de deudas automáticas

1. **Configuración:** en el modal de edición, activa "Débito automático" y define:
   - Cuántas cuotas al mes (1 o 2)
   - Para cada cuota: día del mes y monto
   - Fecha de inicio (opcional; si está vacía, aplica desde la fecha de hoy)

2. **Procesamiento:** al iniciar sesión, `onAuthStateChanged` llama a `processAutoDebits(uid)`:
   - Itera sobre todas las deudas con `automaticDebit === true`
   - Calcula qué cuotas vencían desde `debitStartDate` (o el primer día del mes) hasta hoy
   - Por cada cuota vencida que no ha sido procesada (según `lastAutoDebitRun`),
     aplica `applyDebtPayment(debt, amount, fecha, true)`
   - `applyDebtPayment` resta el monto del saldo, recalcula cuotas restantes,
     crea una transacción de gasto categoría "Deuda" y actualiza Firebase

3. **Visualización:** `renderDebts()` muestra etiqueta "Débito automático" en lugar
   de "Manual" y **no muestra** botón "Registrar pago del mes" para deudas automáticas.

### Flujo de deudas manuales

1. **Registro:** la usuaria clickea "Registrar pago del mes" en la tarjeta de deuda
2. Un `prompt()` abre con la sugerencia de monto (`cuotaMensual`)
3. La usuaria ingresa el monto que abonó (se limpia de puntos y comas)
4. `registerDebtPayment()` llama a `applyDebtPayment()` con `isAuto === false`
5. Se crea la transacción, se actualiza el saldo y se recarga la vista

### Edición de una deuda existente

`openDebtModal(id)` abre el modal con todos los campos precargados. Al guardar con
`saveDebt()`, se valida que:
- Si es automática con 1 cuota: `debitAmount1 > 0`
- Si es automática con 2 cuotas: `debitAmount1 + debitAmount2 > 0`
- Todos los días de mes estén entre 1 y 31
- Los nombres y montos no sean vacíos

Luego se actualiza en Firestore y se recarga `renderDebts()`.

## Lógica del simulador

`runSimulation()` reparte un monto según reglas específicas de la usuaria:
las tarjetas Nubank **no admiten abono parcial**, así que solo se recomienda pagarlas
si el monto cubre el saldo total; si no alcanza, reparte entre fondo de vivienda,
colchón de emergencia y gasto libre. Las cesantías y el ahorro permanente nunca se
tocan ni se sugieren.

## Configuración de Firebase

La app necesita un proyecto Firebase (plan gratuito "Spark" es suficiente). Pasos:

1. **Crear el proyecto** en https://console.firebase.google.com (Analytics opcional).
2. **Authentication** → Comenzar → activar el proveedor **Google** → guardar.
3. **Firestore Database** → Crear base de datos → región `southamerica-east1`
   (São Paulo, la más cercana a Colombia) → modo producción.
4. **Reglas de seguridad** (Firestore → pestaña Reglas). Cada usuario solo puede
   leer/escribir sus propios datos:

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

5. **Conectar la app:** en Configuración del proyecto → Tus apps → `</>` (Web),
   registrar la app y copiar el objeto `firebaseConfig` a `firebase-config.js`.
6. **Dominios autorizados:** agregar el dominio de publicación (Netlify, GitHub Pages
   o `localhost`) en Authentication → Settings → Authorized domains, o el login con
   Google será rechazado.

Despliegue rápido: arrastrar la carpeta (con `index.html`, `app.js`,
`firebase-config.js`, `manifest.json`) a https://app.netlify.com/drop. El primer
login con Google dispara el seed automático de los datos de la usuaria.

## Notas / problemas conocidos

- `firebase-config.js` contiene las claves del proyecto Firebase. En apps web de
  Firebase la `apiKey` es pública por diseño; la seguridad real depende de las
  **reglas de Firestore** (ver arriba), que restringen cada usuario a `users/{suUid}`.
- Iconos PWA en `icon-192.png` y `icon-512.png` (wallet de Lucide sobre
  el gradiente esmeralda de marca, full-bleed → `purpose: "any maskable"`).
- La app usa **solo Google Sign-In**. El dominio donde se publique (Netlify, GitHub
  Pages, `localhost`) debe estar en Firebase Console → Authentication → Settings →
  Authorized domains para que el login funcione.