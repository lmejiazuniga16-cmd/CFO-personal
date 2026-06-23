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
| `netlify/functions/claude-proxy.js` | Función serverless (proxy) para conectar con la API de Anthropic ocultando la API Key. |
| `netlify.toml`         | Archivo de configuración que le indica a Netlify dónde se encuentran las funciones. |

## Arquitectura

- **Auth:** Firebase Authentication con Google (`signInWithPopup`). `onAuthStateChanged`
  controla qué pantalla se muestra (`#auth-screen` vs `#app`).
- **Datos:** Cloud Firestore. Todo cuelga de `users/{uid}/...`:
  - `users/{uid}/debts/{debtId}` — una deuda por documento. Campos: `id`, `nombre`, `saldo`,
    `saldoOriginal`, `cuotaMensual`, `tasaEA`, `cuotasRestantes`, `fechaFin`, `pago`,
    `abonoParcial`, `automaticDebit`, `debitPaymentsPerMonth`, `debitStartDate`, `lastAutoDebitRun`,
    `color`, `debtType`, `refCapital`, `refIntereses`, `refSeguro`, `refOtros`, `refAbono`,
    `refConceptosExtra`, `debitSameValues`, y campos dinámicos indexados para cada cuota del mes
    (de 1 a `debitPaymentsPerMonth`): `debitDayX`, `debitAmountX`, `debitDateX`, `debitConceptsX` (array de `{nombre, valor}`).
  - `users/{uid}/transactions/{autoId}` — cada gasto/ingreso registrado.
  - `users/{uid}/meta/ahorros` — documento con el listado de ahorros en un array `ahorros` de objetos: `{ id, nombre, descripcion, valor, ultimaActualizacion }`.
  - `users/{uid}/meta/perfil`, `meta/categorias` — documentos de configuración y perfil.
- **Sincronización en vivo:** las transacciones se escuchan con `onSnapshot`
  (`listenToTransactions`), así cualquier cambio re-renderiza la UI al instante en
  todos los dispositivos. El listener se guarda en `unsubTx` y se cancela al cerrar sesión.
- **Gestión de deudas:**
  - **Deudas automáticas:** si `automaticDebit` es `true`, se procesan automáticamente
    en las fechas y montos especificados en el array `debits` (que contiene las cuotas
    configuradas en el mes: `day`, `amount`). Los débitos vencidos se aplican al iniciar
    sesión con `processAutoDebits()`. Cada débito crea una transacción de gasto de
    categoría "Deuda" y reduce el saldo automáticamente.
  - **Deudas manuales:** si `automaticDebit` es `false`, la usuaria ve un botón
    "Registrar pago o abono" en la tarjeta. Si la deuda admite abono parcial (`abonoParcial === true`),
    se abre un modal de desglose de conceptos quincenales/extraordinarios. Si no, se abre
    un modal simplificado de pago.
  - En ambos casos, `renderDebts()` muestra la etiqueta "Débito automático" o "Manual"
    y botón "Editar" que abre el modal de edición de deuda (`openDebtModal`).
- **Editar/eliminar movimientos:** cualquier transacción de la lista (preview de Inicio
  o Historial) es clicable y reabre el mismo modal precargado (`openEditTx`). El estado
  `editingTxId` distingue alta (`addDoc`) de edición (`updateDoc`, solo monto/descripción/
  categoría/fecha — el `tipo` y `creadoEn` se conservan). El botón rojo "Eliminar
  movimiento" hace `deleteDoc` con confirmación. Al editar se oculta el selector
  Gasto↔Ingreso; si la categoría del movimiento ya fue borrada, se reinyecta como opción.
- **Editar deudas:** modal de deuda (`debt-modal-bg`) permite cambiar nombre, saldo,
  cuotas, cuota mensual, tasa, descripción del pago, y configurar cuotas/quincenas por mes (1 o 2) y sus fechas/montos. Esto se muestra tanto para débito automático como para deudas que admiten abono parcial (`abonoParcial === true`). La fecha de inicio de débito automático solo se muestra si `automaticDebit` está activo. `saveDebt()` actualiza en Firestore y recarga el renderizado.
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
- `initMoneyInput(input)` — helper que aplica formato automático de moneda colombiana (puntos de miles, coma decimal, prefijo `$`) a cualquier input numérico de monto. Llamar sobre cada input de monto al crearlo o inyectarlo en el DOM.
- `openModal(type)` — abre el modal de registrar transacción recibiendo el tipo `'expense'` o `'income'` para preseleccionar la pestaña Gasto o Ingreso.
- **Menú de acciones rápidas (FAB):** El botón flotante principal (`+`) despliega un menú vertical con tres opciones rápidas: **Gasto** (abre el modal en modo gasto), **Ingreso** (abre el modal en modo ingreso) y **Deuda** (abre `openDebtModal('nueva')` para crear una nueva deuda). Se colapsa al hacer clic en una opción o fuera del menú.
- **Gestión de ahorros (`ahorrosState`)**: Los ahorros se cargan desde Firestore a la variable de estado `ahorrosState`. Las operaciones CRUD del modal `#savings-modal-bg` se gestionan mediante `openSavingsModal(id)`, `closeSavingsModal()`, `saveSavings()` y `deleteSavings(id)`, todos expuestos en `window.*`.



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
  debtType: "automatico",           // "automatico" (Libranza) o "tarjeta" (TC)
  refCapital: 0,                    // abono capital mensual de referencia (solo automatico)
  refIntereses: 0,                  // intereses mensuales de referencia
  refSeguro: 0,                     // seguro vida de referencia (solo automatico)
  refOtros: 0,                      // otros conceptos de referencia (solo automatico)
  refConceptosExtra: [],            // conceptos dinámicos extra (solo automatico): array de {nombre, valor}
  refAbono: 0,                      // abono mensual de referencia (solo tarjeta)
  // Campos de débito automático:
  automaticDebit: false,           // true = automática, false = manual
  debitPaymentsPerMonth: 1,         // número entero de cuotas al mes (1, 2, 3, etc.)
  debitSameValues: true,            // true = conceptos/valores iguales en todas las cuotas, false = diferentes
  debitStartDate: null,             // fecha de inicio (ISO YYYY-MM-DD)
  lastAutoDebitRun: null,           // fecha del último débito procesado
  debits: [],                       // array de cuotas para el motor de pagos: [{day, amount}]
  // Campos dinámicos indexados de 1 a debitPaymentsPerMonth:
  debitDay1: 1,                     // día del mes de la cuota 1
  debitAmount1: 698886,             // monto total de la cuota 1
  debitDate1: "2026-06-01",         // fecha seleccionada para la cuota 1
  debitConcepts1: [],               // desglose de conceptos para la cuota 1: array de {nombre, valor}
  ...
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

1. **Registro:** la usuaria hace clic en "Registrar pago o abono" en la tarjeta de la deuda (`registerDebtPayment`).
2. **Modal de pago:**
   - **Caso Tarjetas de Crédito (`debtType === "tarjeta"`)**: Se abre el modal de tarjetas (`openTarjetaPayModal`) precargado con `refAbono` y `refIntereses`. Al confirmar (`confirmTarjetaPayment`), se registra una transacción por el total (abono + intereses) y se resta solo el `abono a la deuda` del saldo.
   - **Caso Crédito Automático (`debtType === "automatico"`)**: Se abre el modal quincenal por conceptos (`buildPartialDebtPayModal`) precargado con los valores de referencia (`refCapital`, `refIntereses`, `refSeguro`, `refOtros`). Al confirmar (`confirmPartialDebtPayment`), se registra la transacción por el total y se resta solo el `abono a capital` del saldo.
3. **Modal de conceptos (Libranza/Abono Parcial):**
   - Inicializa los conceptos y permite agregar/eliminar conceptos.
   - Selecciona por defecto "Quincena 1" o "Quincena 2" según la fecha elegida (1-15 vs 16+), o "Abono Extraordinario" si se requiere.
   - Calcula el total y simula el impacto en saldo, cuotas restantes y fecha de fin en tiempo real.
4. **Confirmación:** Registra la transacción de gasto con el total de conceptos, actualiza el saldo reduciendo *únicamente* el abono asignado a capital, recalcula las cuotas restantes estimadas y la nueva fecha de fin (`addMonthsToDate` desde hoy), y actualiza Firestore.

### Edición de una deuda existente

`openDebtModal(id)` abre el modal con todos los campos precargados. Al guardar con
`saveDebt()`, se valida que:
- Si es automática con 1 cuota: `debitAmount1 > 0`
- Si es automática con 2 cuotas: `debitAmount1 + debitAmount2 > 0`
- Todos los días de mes estén entre 1 y 31
- Los nombres y montos no sean vacíos

Luego se actualiza en Firestore y se recarga `renderDebts()`.

## Lógica del simulador

`runSimulation()` es una función asíncrona que delega el análisis financiero a la inteligencia artificial mediante la API de Anthropic (`claude-sonnet-4-6`), comunicándose a través de una función serverless local (`/.netlify/functions/claude-proxy`) para evitar bloqueos por CORS y mantener segura la clave secreta de la API:
1. **Flujo de Ejecución**:
   - Al hacer clic en "Simular", se deshabilita el botón `#sim-btn` y se inyecta un loader animado (`.spinner`) en `#sim-result` para indicar el estado de carga.
   - Se compila el contexto financiero en tiempo real de Marcela: listado de deudas (`debtsState`), ahorros (`ahorrosState`), flujo mensual (`INGRESO_NETO_MENSUAL` y `FLUJO_LIBRE_MENSUAL`), metas del perfil y restricciones de negocio.
   - Se envía la información a `/.netlify/functions/claude-proxy` en un payload JSON estructurado con `system` y `messages`. La función serverless añade la API Key `ANTHROPIC_API_KEY` (guardada en las variables de entorno de Netlify) y la cabecera de versión de Anthropic, realizando la llamada segura al backend de Anthropic.
2. **Presentación de la Respuesta**:
   - La respuesta del modelo en formato Markdown se procesa localmente mediante `parseMarkdownToHTML(texto)`, convirtiendo negritas (`**`), saltos de línea (`\n`), listas con viñetas (`-` / `*`) y títulos (`#`, `##`, `###`) en HTML básico con colores coherentes al tema.
   - Se habilita de nuevo el botón y se re-renderizan los iconos Lucide (`renderIcons()`).



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