import { auth, db } from "./firebase-config.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, doc, setDoc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, onSnapshot,
  query, orderBy, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ============================================================
// DATOS BASE DE MARCELA — precargados desde el resumen financiero
// (junio 2026). Esto se guarda en Firestore en el primer login
// y desde ahí se puede editar dentro de la app.
// ============================================================
const DEUDAS_INICIALES = [
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
    automaticDebit: false,
    debitPaymentsPerMonth: 1,
    debitDay1: 1,
    debitAmount1: 698886,
    debitDay2: 15,
    debitAmount2: 0,
    debitStartDate: null,
    lastAutoDebitRun: null,
    color: "blue"
  },
  {
    id: "nubank-portatil",
    nombre: "Nubank — Portátil casa",
    saldo: 1517719,
    saldoOriginal: 1517719,
    cuotaMensual: 100461,
    tasaEA: 26.23,
    cuotasRestantes: 23,
    fechaFin: "2028-05-30",
    pago: "Paga ella (día 30)",
    abonoParcial: false,
    automaticDebit: false,
    debitPaymentsPerMonth: 1,
    debitDay1: 30,
    debitAmount1: 100461,
    debitDay2: 0,
    debitAmount2: 0,
    debitStartDate: null,
    lastAutoDebitRun: null,
    color: "amber"
  },
  {
    id: "nubank-dropshipping",
    nombre: "Nubank — Curso Dropshipping",
    saldo: 1277778,
    saldoOriginal: 1277778,
    cuotaMensual: 80779,
    tasaEA: 24.60,
    cuotasRestantes: 24,
    fechaFin: "2028-06-30",
    pago: "Paga ella (día 30)",
    abonoParcial: false,
    automaticDebit: false,
    debitPaymentsPerMonth: 1,
    debitDay1: 30,
    debitAmount1: 80779,
    debitDay2: 0,
    debitAmount2: 0,
    debitStartDate: null,
    lastAutoDebitRun: null,
    color: "amber"
  }
];

const AHORROS_INICIALES = {
  cesantias: { nombre: "Cesantías (Porvenir)", valor: 7869004, estado: "Inmovilizado — subsidio vivienda. NO TOCAR." },
  fondoPermanente: { nombre: "Ahorro permanente Fondo de Occidente", valor: 5538123, estado: "Inmovilizado — retiro solo al salir de la empresa" },
  dale: { nombre: "Cuenta DALE", valor: 1095539, estado: "Disponible — renta 10,5% EA" },
  efectivo: { nombre: "Efectivo", valor: 20000, estado: "Disponible" }
};

const HITOS_TIMELINE = [
  { fecha: "2026-06-04", label: "Prima jun.", detalle: "TC + Fondo saldados", monto: "+$940.371/mes", done: true },
  { fecha: "2026-09-01", label: "Sep. 2026", detalle: "Tarjeta Prof. saldada", monto: "+$99.333/mes", done: true },
  { fecha: "2027-01-01", label: "Ene. 2027", detalle: "Multa carro saldada", monto: "+$67.234/mes", done: true },
  { fecha: "2028-05-30", label: "May. 2028", detalle: "Nubank portátil termina", monto: "+$100.461/mes", done: false },
  { fecha: "2028-06-30", label: "Jun. 2028", detalle: "Nubank curso termina", monto: "+$80.779/mes", done: false },
  { fecha: "2029-11-30", label: "Nov. 2029", detalle: "Libranza termina — DEUDA CERO", monto: "+$698.886/mes", done: false }
];

// Montos fijos mensuales en 0: el dashboard arranca desde cero y todos los
// ingresos/gastos se registran manualmente. (Valores originales de Marcela:
// gastos fijos 1.192.950, descuentos nómina 882.376, ingreso neto 3.449.080,
// flujo libre 1.107.934 — restaurar aquí si se quiere volver a esa base.)
const GASTOS_FIJOS_MENSUALES = 0;
const DESCUENTOS_NOMINA_DEUDA = 0;
const INGRESO_NETO_MENSUAL = 0;
const FLUJO_LIBRE_MENSUAL = 0;

const CATEGORIAS_GASTO_DEFAULT = ["Comida", "Transporte", "Vivienda/Servicios", "Deuda", "Entretenimiento", "Familia", "Salud", "Ahorro", "Otro"];
const CATEGORIAS_INGRESO_DEFAULT = ["Salario", "Prima", "UGC", "Dropshipping", "Devolución", "Otro"];

// Iconos Lucide por categoría (se usan en transacciones y en el editor)
const ICON_MAP = {
  "Comida": "utensils", "Transporte": "bus", "Vivienda/Servicios": "house", "Deuda": "credit-card",
  "Entretenimiento": "clapperboard", "Familia": "users", "Salud": "heart-pulse", "Ahorro": "piggy-bank", "Otro": "package",
  "Salario": "briefcase", "Prima": "gift", "UGC": "video", "Dropshipping": "package", "Devolución": "corner-down-left"
};
const DEFAULT_ICON = "tag";

// Set curado de iconos Lucide para asignar a categorías nuevas
const ICON_CHOICES = [
  "tag", "utensils", "bus", "car", "house", "credit-card", "banknote", "hand-coins",
  "shopping-cart", "shopping-bag", "smartphone", "zap", "wifi", "heart-pulse", "pill",
  "piggy-bank", "users", "baby", "graduation-book", "book-open", "clapperboard", "gamepad-2",
  "dumbbell", "plane", "gift", "briefcase", "video", "coffee", "shirt", "wrench", "paw-print", "package"
];

// Helpers de render con Lucide (sin build / sin React: usamos el paquete vanilla)
const iconHtml = (name) => `<i data-lucide="${name || DEFAULT_ICON}"></i>`;
const renderIcons = () => { if (window.lucide) window.lucide.createIcons(); };
const catIcon = (name) => ICON_MAP[name] || DEFAULT_ICON;

let categoriasGasto = [...CATEGORIAS_GASTO_DEFAULT];
let categoriasIngreso = [...CATEGORIAS_INGRESO_DEFAULT];

let currentUser = null;
let currentTxType = "expense";
let editingTxId = null; // id de la transacción en edición (null = registrando una nueva)
let editingDebtId = null; // id de la deuda en edición
let unsubTx = null;
let allTransactions = [];
let debtsState = JSON.parse(JSON.stringify(DEUDAS_INICIALES));

// Privacidad: ocultar el monto de flujo libre (se recuerda en localStorage)
let flujoHidden = localStorage.getItem("cfo_flujo_oculto") === "true";
let heroFlujoText = "$0";

// ============================================================
// PERIODO — rango de fechas que filtra Inicio e Historial
// 'currentMonth' = vista completa con montos fijos (comportamiento por
// defecto). 'custom' = solo movimientos registrados dentro del rango.
// Todo el filtrado es en cliente sobre allTransactions (sin tocar Firebase).
// ============================================================
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const firstOfMonthISO = (d) => isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
const lastOfMonthISO = (d) => isoDate(new Date(d.getFullYear(), d.getMonth()+1, 0));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

let periodStart, periodEnd, periodMode;
function defaultPeriod() {
  const now = new Date();
  periodStart = firstOfMonthISO(now);
  periodEnd = lastOfMonthISO(now);
  periodMode = "currentMonth";
}
defaultPeriod();

const txInPeriod = () => allTransactions.filter(t => t.fecha >= periodStart && t.fecha <= periodEnd);

function rangeLabel(a, b) {
  const opt = { day: "numeric", month: "short" };
  const sa = new Date(a + "T12:00:00").toLocaleDateString("es-CO", opt);
  if (a === b) return sa;
  const sb = new Date(b + "T12:00:00").toLocaleDateString("es-CO", opt);
  return `${sa} – ${sb}`;
}
function periodLabel() {
  if (periodMode === "currentMonth") {
    const d = new Date(periodStart + "T12:00:00");
    return cap(MESES[d.getMonth()]) + " " + d.getFullYear();
  }
  return rangeLabel(periodStart, periodEnd);
}

const fmt = (n) => "$" + Math.round(n).toLocaleString("es-CO");
const todayISO = () => new Date().toISOString().split("T")[0];

// ============================================================
// SESIÓN PERSISTENTE — no volver a iniciar sesión cada vez
// Firebase ya guarda el token en el navegador; lo hacemos explícito con
// browserLocalPersistence para que la sesión sobreviva al cerrar la pestaña.
// La clave en localStorage es solo una pista de UX: un booleano no autentica
// por sí solo, el token de Firebase es lo que mantiene la sesión.
// ============================================================
const SESION_KEY = "cfo_sesion_activa";
const NOMBRE_KEY = "cfo_usuario_nombre";

setPersistence(auth, browserLocalPersistence).catch(() => {});

// Si ya había sesión, personaliza la pantalla de carga mientras Firebase la restaura
if (localStorage.getItem(SESION_KEY) === "true") {
  const loaderTxt = document.querySelector("#loader span");
  const nombre = (localStorage.getItem(NOMBRE_KEY) || "").split(" ")[0];
  if (loaderTxt) loaderTxt.textContent = nombre ? `Reanudando la sesión de ${nombre}…` : "Reanudando tu sesión…";
}

// ============================================================
// AUTH — Entrar con Google
// ============================================================
const googleProvider = new GoogleAuthProvider();

window.handleAuth = async () => {
  const errEl = document.getElementById("auth-error");
  errEl.classList.remove("show");
  try {
    const result = await signInWithPopup(auth, googleProvider);
    // Si es la primera vez que entra, precargamos sus datos reales
    const debtsSnap = await getDocs(collection(db, "users", result.user.uid, "debts"));
    if (debtsSnap.empty) {
      await seedInitialData(result.user.uid);
    }
  } catch (e) {
    errEl.innerHTML = `${iconHtml("triangle-alert")}<span>${traducirErrorFirebase(e.code)}</span>`;
    errEl.classList.add("show");
    renderIcons();
  }
};

function traducirErrorFirebase(code) {
  const map = {
    "auth/popup-closed-by-user": "Cerraste la ventana antes de terminar. Intenta de nuevo.",
    "auth/network-request-failed": "Sin conexión a internet. Revisa tu red.",
    "auth/popup-blocked": "El navegador bloqueó la ventana. Permite ventanas emergentes e intenta de nuevo."
  };
  return map[code] || "Algo salió mal. Intenta de nuevo.";
}

window.handleLogout = async () => {
  if (unsubTx) unsubTx();
  await signOut(auth);
};

onAuthStateChanged(auth, async (user) => {
  document.getElementById("loader").classList.add("hide");
  if (user) {
    currentUser = user;
    // Marca de sesión activa en localStorage (pista de UX para el próximo arranque)
    localStorage.setItem(SESION_KEY, "true");
    localStorage.setItem(NOMBRE_KEY, user.displayName || "");
    document.getElementById("auth-screen").classList.add("hide");
    document.getElementById("app").classList.remove("hide");
    updatePeriodUI();
    await loadDebtsState(user.uid);
    await processAutoDebits(user.uid);
    await loadCategories(user.uid);
    listenToTransactions(user.uid);
  } else {
    currentUser = null;
    localStorage.removeItem(SESION_KEY);
    localStorage.removeItem(NOMBRE_KEY);
    document.getElementById("app").classList.add("hide");
    document.getElementById("auth-screen").classList.remove("hide");
  }
  renderIcons();
});

// ============================================================
// SEED — primera vez que el usuario crea cuenta, precargamos
// sus datos reales del resumen financiero
// ============================================================
async function seedInitialData(uid) {
  const batch = writeBatch(db);
  DEUDAS_INICIALES.forEach(d => {
    batch.set(doc(db, "users", uid, "debts", d.id), d);
  });
  batch.set(doc(db, "users", uid, "meta", "ahorros"), AHORROS_INICIALES);
  batch.set(doc(db, "users", uid, "meta", "perfil"), {
    nombre: "Marcela",
    ingresoNetoMensual: INGRESO_NETO_MENSUAL,
    gastosFijosMensuales: GASTOS_FIJOS_MENSUALES,
    flujoLibreMensual: FLUJO_LIBRE_MENSUAL,
    creadoEn: new Date().toISOString()
  });
  await batch.commit();
}

// ============================================================
// DEUDAS — cargar desde Firestore (en vivo)
// ============================================================
async function loadDebtsState(uid) {
  const snap = await getDocs(collection(db, "users", uid, "debts"));
  if (snap.empty) {
    await seedInitialData(uid);
    debtsState = JSON.parse(JSON.stringify(DEUDAS_INICIALES));
  } else {
    debtsState = snap.docs.map(d => d.data());
  }
  renderDebts();
  renderTimeline();
}

function openDebtModal(id) {
  editingDebtId = id;
  const debt = debtsState.find(d => d.id === id);
  if (!debt) return;
  document.getElementById("debt-modal-title").textContent = `Editar deuda`;
  document.getElementById("debt-name").value = debt.nombre;
  document.getElementById("debt-saldo").value = debt.saldo;
  document.getElementById("debt-cuotas").value = debt.cuotasRestantes;
  document.getElementById("debt-cuotaMensual").value = debt.cuotaMensual;
  document.getElementById("debt-tasaEA").value = debt.tasaEA;
  document.getElementById("debt-pago").value = debt.pago;
  document.getElementById("debt-automaticDebit").checked = Boolean(debt.automaticDebit);
  document.getElementById("debt-debitPaymentsPerMonth").value = debt.debitPaymentsPerMonth || 1;
  document.getElementById("debt-debitDay1").value = debt.debitDay1 || 1;
  document.getElementById("debt-debitAmount1").value = debt.debitAmount1 || debt.cuotaMensual || 0;
  document.getElementById("debt-debitDay2").value = debt.debitDay2 || 1;
  document.getElementById("debt-debitAmount2").value = debt.debitAmount2 || 0;
  document.getElementById("debt-debitStartDate").value = debt.debitStartDate || "";
  toggleDebtAutoFields();
  document.getElementById("debt-modal-bg").classList.add("show");
  renderIcons();
}

window.toggleDebtAutoFields = () => {
  const auto = document.getElementById("debt-automaticDebit").checked;
  document.getElementById("debt-auto-fields").classList.toggle("hide", !auto);
  const payments = Number(document.getElementById("debt-debitPaymentsPerMonth").value);
  document.getElementById("debt-split-row-2").classList.toggle("hide", payments !== 2);
};

window.saveDebt = async () => {
  if (!currentUser || !editingDebtId) return;
  const debt = debtsState.find(d => d.id === editingDebtId);
  if (!debt) return;
  const nombre = document.getElementById("debt-name").value.trim();
  const saldo = parseFloat(document.getElementById("debt-saldo").value);
  const cuotasRestantes = parseInt(document.getElementById("debt-cuotas").value, 10);
  const cuotaMensual = parseFloat(document.getElementById("debt-cuotaMensual").value);
  const tasaEA = parseFloat(document.getElementById("debt-tasaEA").value);
  const pago = document.getElementById("debt-pago").value.trim();
  const automaticDebit = document.getElementById("debt-automaticDebit").checked;
  const debitPaymentsPerMonth = Number(document.getElementById("debt-debitPaymentsPerMonth").value);
  const debitDay1 = Number(document.getElementById("debt-debitDay1").value);
  const debitAmount1 = parseFloat(document.getElementById("debt-debitAmount1").value);
  const debitDay2 = Number(document.getElementById("debt-debitDay2").value);
  const debitAmount2 = parseFloat(document.getElementById("debt-debitAmount2").value);
  const debitStartDate = document.getElementById("debt-debitStartDate").value || null;

  if (!nombre || isNaN(saldo) || isNaN(cuotaMensual) || !pago) {
    showToast("Completa nombre, saldo, cuota mensual y pago", true);
    return;
  }

  const payload = {
    ...debt,
    nombre,
    saldo,
    cuotasRestantes: isNaN(cuotasRestantes) ? Math.max(0, Math.ceil(saldo / cuotaMensual)) : cuotasRestantes,
    cuotaMensual,
    tasaEA: isNaN(tasaEA) ? debt.tasaEA : tasaEA,
    pago,
    automaticDebit,
    debitPaymentsPerMonth: automaticDebit ? Math.max(1, Math.min(2, debitPaymentsPerMonth)) : 1,
    debitDay1: automaticDebit ? Math.max(1, Math.min(31, debitDay1 || 1)) : 1,
    debitAmount1: automaticDebit ? (isNaN(debitAmount1) ? cuotaMensual : debitAmount1) : 0,
    debitDay2: automaticDebit && debitPaymentsPerMonth === 2 ? Math.max(1, Math.min(31, debitDay2 || 1)) : 0,
    debitAmount2: automaticDebit && debitPaymentsPerMonth === 2 ? (isNaN(debitAmount2) ? 0 : debitAmount2) : 0,
    debitStartDate,
  };

  if (payload.automaticDebit && payload.debitPaymentsPerMonth === 2 && payload.debitAmount1 + payload.debitAmount2 === 0) {
    showToast("Define montos para ambas cuotas", true);
    return;
  }
  if (payload.automaticDebit && payload.debitPaymentsPerMonth === 1 && payload.debitAmount1 === 0) {
    showToast("Define el monto de la cuota automática", true);
    return;
  }

  try {
    await setDoc(doc(db, "users", currentUser.uid, "debts", debt.id), payload);
    showToast("Deuda actualizada");
    closeDebtModal();
    await loadDebtsState(currentUser.uid);
  } catch (e) {
    showToast("Error al guardar deuda", true);
  }
};

window.closeDebtModal = () => {
  document.getElementById("debt-modal-bg").classList.remove("show");
};

window.registerDebtPayment = async (id) => {
  const debt = debtsState.find(d => d.id === id);
  if (!debt) return;
  const defaultAmount = debt.cuotaMensual;
  const answer = prompt(`Registro de pago mensual para "${debt.nombre}"
Monto sugerido: ${fmt(defaultAmount)}
Ingresa el monto abonado:`, String(defaultAmount));
  if (!answer) return;
  const amount = parseFloat(answer.replace(/\./g, "").replace(/,/g, ""));
  if (isNaN(amount) || amount <= 0) {
    showToast("Monto inválido", true);
    return;
  }
  const fecha = todayISO();
  await applyDebtPayment(debt, amount, fecha, false);
};

async function applyDebtPayment(debt, amount, fecha, isAuto) {
  if (!currentUser) return debt;
  const payment = Math.min(amount, debt.saldo);
  if (payment <= 0) {
    showToast("La deuda ya está saldada", true);
    return debt;
  }
  const newSaldo = Math.max(0, debt.saldo - payment);
  const newCuotas = Math.max(0, Math.ceil(newSaldo / debt.cuotaMensual));
  const updatedDebt = { ...debt, saldo: newSaldo, cuotasRestantes: newCuotas };
  if (isAuto) updatedDebt.lastAutoDebitRun = fecha;
  try {
    await addDoc(collection(db, "users", currentUser.uid, "transactions"), {
      tipo: "expense",
      monto: payment,
      descripcion: `${isAuto ? "Débito automático" : "Pago de deuda"} — ${debt.nombre}`,
      categoria: "Deuda",
      fecha,
      creadoEn: serverTimestamp()
    });
    await setDoc(doc(db, "users", currentUser.uid, "debts", debt.id), updatedDebt);
    if (isAuto) showToast("Débito automático registrado");
    else showToast("Pago de deuda guardado");
    await loadDebtsState(currentUser.uid);
    return updatedDebt;
  } catch (e) {
    showToast("Error al registrar pago", true);
    return debt;
  }
}

function getLastDayOfMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

async function processAutoDebits(uid) {
  if (!uid) return;
  const today = new Date();
  const debtsSnap = await getDocs(collection(db, "users", uid, "debts"));
  let debts = debtsSnap.docs.map(d => d.data());
  for (let debt of debts) {
    if (!debt.automaticDebit || debt.saldo <= 0) continue;
    const lastProcessed = debt.lastAutoDebitRun ? new Date(debt.lastAutoDebitRun + "T12:00:00") : null;
    const startDate = debt.debitStartDate ? new Date(debt.debitStartDate + "T12:00:00") : null;
    let cursor = startDate ? new Date(startDate.getFullYear(), startDate.getMonth(), 1) : new Date(today.getFullYear(), today.getMonth(), 1);
    if (lastProcessed) {
      const lastMonth = new Date(lastProcessed.getFullYear(), lastProcessed.getMonth(), 1);
      if (cursor < lastMonth) cursor = lastMonth;
    }
    while (cursor.getFullYear() < today.getFullYear() || cursor.getMonth() <= today.getMonth()) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const payments = [];
      if (debt.debitPaymentsPerMonth >= 1 && debt.debitDay1) payments.push({ day: debt.debitDay1, amount: debt.debitAmount1 || 0 });
      if (debt.debitPaymentsPerMonth >= 2 && debt.debitDay2) payments.push({ day: debt.debitDay2, amount: debt.debitAmount2 || 0 });
      for (const p of payments) {
        if (!p.amount || p.amount <= 0) continue;
        const dueDay = Math.min(p.day, getLastDayOfMonth(year, month));
        const dueDate = new Date(year, month, dueDay, 12, 0, 0);
        if (dueDate > today) continue;
        if (startDate && dueDate < startDate) continue;
        if (lastProcessed && dueDate <= lastProcessed) continue;
        debt = await applyDebtPayment(debt, p.amount, dueDate.toISOString().split("T")[0], true);
      }
      cursor.setMonth(cursor.getMonth() + 1);
      if (cursor.getFullYear() === today.getFullYear() && cursor.getMonth() > today.getMonth()) break;
    }
  }
}

function renderDebts() {
  const totalDeuda = debtsState.reduce((s, d) => s + d.saldo, 0);
  document.getElementById("hero-deuda").textContent = fmt(totalDeuda);

  const preview = document.getElementById("debts-preview");
  const full = document.getElementById("debts-full");
  preview.innerHTML = "";
  full.innerHTML = "";

  debtsState.forEach(d => {
    const pctPagado = Math.max(0, Math.min(100, 100 - (d.saldo / d.saldoOriginal) * 100));
    const icName = d.id.startsWith("nubank") ? "credit-card" : "landmark";
    const icClass = d.color === "amber" ? "amber" : "";
    const card = document.createElement("div");
    card.className = "card debt-card";
    card.innerHTML = `
      <div class="debt-top">
        <div class="debt-id">
          <span class="debt-ic ${icClass}">${iconHtml(icName)}</span>
          <div>
            <div class="debt-name">${d.nombre}</div>
            <div class="debt-tag">${d.automaticDebit ? 'Débito automático' : 'Manual'} · ${d.pago}</div>
          </div>
        </div>
        <div class="debt-rate">${d.tasaEA}% EA</div>
      </div>
      <div class="debt-bar-wrap"><div class="debt-bar" style="width:${pctPagado}%"></div></div>
      <div class="debt-meta">
        <span>Saldo <span class="amt">${fmt(d.saldo)}</span></span>
        <span class="right">${d.cuotasRestantes} cuotas · ${fmt(d.cuotaMensual)}/mes</span>
      </div>
      ${!d.abonoParcial ? `<div class="debt-locked">${iconHtml("lock")} No admite abono parcial — solo cuota mínima o saldo total</div>` : ''}
      <div class="debt-actions">
        <button class="debt-action" onclick="openDebtModal('${d.id}')">Editar</button>
        ${!d.automaticDebit ? `<button class="debt-action secondary" onclick="registerDebtPayment('${d.id}')">Registrar pago del mes</button>` : ''}
      </div>`;
    full.appendChild(card.cloneNode(true));
    if (preview.children.length < 2) preview.appendChild(card);
  });
  renderIcons();
}

// ============================================================
// TRANSACCIONES — listener en tiempo real (esto es lo que
// sincroniza celular y computador automáticamente)
// ============================================================
function listenToTransactions(uid) {
  if (unsubTx) unsubTx();
  const q = query(collection(db, "users", uid, "transactions"), orderBy("fecha", "desc"));
  unsubTx = onSnapshot(q, (snap) => {
    allTransactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
  });
}

function renderHero() {
  const eyebrow = document.getElementById("hero-eyebrow");
  const sub = document.getElementById("hero-sub");
  let ingresosTotal, gastosTotal, flujo;

  if (periodMode === "currentMonth") {
    // Vista completa del mes: montos fijos + movimientos registrados
    const monthKey = periodStart.slice(0, 7);
    const txM = allTransactions.filter(t => t.fecha.startsWith(monthKey));
    const ingresosManual = txM.filter(t => t.tipo === "income").reduce((s, t) => s + t.monto, 0);
    const gastosManual = txM.filter(t => t.tipo === "expense").reduce((s, t) => s + t.monto, 0);
    ingresosTotal = INGRESO_NETO_MENSUAL + ingresosManual;
    gastosTotal = GASTOS_FIJOS_MENSUALES + DESCUENTOS_NOMINA_DEUDA + gastosManual;
    flujo = ingresosTotal - gastosTotal;
    eyebrow.textContent = "Flujo libre disponible este mes";
    if (ingresosTotal === 0 && gastosTotal === 0) {
      sub.className = "hero-status ok";
      sub.textContent = "Registra tus ingresos y gastos para ver tu flujo del mes.";
    } else if (flujo < 300000) {
      sub.className = "hero-status warn";
      sub.textContent = "Margen ajustado este mes — evita gastos variables grandes.";
    } else {
      sub.className = "hero-status ok";
      sub.textContent = "Vas bien. Considera adelantar ahorro o un abono extra.";
    }
  } else {
    // Rango personalizado: solo movimientos registrados
    const tx = txInPeriod();
    ingresosTotal = tx.filter(t => t.tipo === "income").reduce((s, t) => s + t.monto, 0);
    gastosTotal = tx.filter(t => t.tipo === "expense").reduce((s, t) => s + t.monto, 0);
    flujo = ingresosTotal - gastosTotal;
    eyebrow.textContent = "Balance del periodo (registrado)";
    sub.className = "hero-status ok";
    const n = tx.length;
    sub.textContent = `${rangeLabel(periodStart, periodEnd)} · ${n} ${n === 1 ? "movimiento" : "movimientos"}`;
  }

  const heroEl = document.getElementById("hero-flujo");
  heroFlujoText = fmt(flujo);
  heroEl.classList.toggle("neg", flujo < 0);
  applyFlujoVisibility();
  document.getElementById("hero-ingresos").textContent = fmt(ingresosTotal);
  document.getElementById("hero-gastos").textContent = fmt(gastosTotal);

  // Barra de asignación: parte libre vs. parte comprometida del ingreso
  const freePct = ingresosTotal > 0 ? Math.max(0, Math.min(100, (flujo / ingresosTotal) * 100)) : 0;
  document.getElementById("hero-bar-free").style.width = freePct + "%";
  document.getElementById("hero-bar-spent").style.width = (100 - freePct) + "%";
}

// Muestra el monto real o lo enmascara, y sincroniza el icono del ojo
function applyFlujoVisibility() {
  const heroEl = document.getElementById("hero-flujo");
  if (flujoHidden) {
    heroEl.innerHTML = `$<span class="hero-mask">••••••</span>`;
  } else {
    heroEl.textContent = heroFlujoText;
  }
  heroEl.classList.toggle("masked", flujoHidden);

  const btn = document.getElementById("hero-eye");
  btn.innerHTML = iconHtml(flujoHidden ? "eye-off" : "eye");
  btn.setAttribute("aria-pressed", String(flujoHidden));
  btn.setAttribute("aria-label", flujoHidden ? "Mostrar el monto" : "Ocultar el monto");
  renderIcons();
}

window.toggleFlujo = () => {
  flujoHidden = !flujoHidden;
  localStorage.setItem("cfo_flujo_oculto", String(flujoHidden));
  applyFlujoVisibility();
};

// ---- Control del periodo ----
function renderAll() {
  renderHero();
  renderTxPreview();
  renderTxFull();
  renderChart();
  renderCategoryChart();
}

function updatePeriodUI() {
  document.getElementById("period-label").textContent = periodLabel();
  const custom = periodMode === "custom";
  document.getElementById("period-bar").classList.toggle("custom", custom);
  document.getElementById("period-reset").classList.toggle("hide", !custom);
}

function setPeriod(start, end, mode) {
  periodStart = start;
  periodEnd = end;
  periodMode = mode;
  updatePeriodUI();
  renderAll();
}

window.openPeriod = () => {
  document.getElementById("period-from").value = periodStart;
  document.getElementById("period-to").value = periodEnd;
  document.getElementById("period-err").classList.remove("show");
  document.querySelectorAll(".period-chips button").forEach((b, i) => {
    b.classList.toggle("active", periodMode === "currentMonth" && i === 2); // "Este mes"
  });
  document.getElementById("period-modal-bg").classList.add("show");
  renderIcons();
};

window.closePeriod = () => {
  document.getElementById("period-modal-bg").classList.remove("show");
};

window.setPeriodPreset = (name) => {
  const now = new Date();
  let s, e, mode = "custom";
  if (name === "today") {
    s = e = isoDate(now);
  } else if (name === "week") {
    const offset = (now.getDay() + 6) % 7; // lunes como inicio de semana
    const mon = new Date(now);
    mon.setDate(now.getDate() - offset);
    s = isoDate(mon);
    e = isoDate(now);
  } else if (name === "month") {
    s = firstOfMonthISO(now);
    e = lastOfMonthISO(now);
    mode = "currentMonth";
  } else if (name === "lastmonth") {
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    s = firstOfMonthISO(lm);
    e = lastOfMonthISO(lm);
  }
  setPeriod(s, e, mode);
  closePeriod();
};

window.applyPeriod = () => {
  const f = document.getElementById("period-from").value;
  const t = document.getElementById("period-to").value;
  const err = document.getElementById("period-err");
  if (!f || !t) {
    err.textContent = "Elige una fecha de inicio y una de fin.";
    err.classList.add("show");
    return;
  }
  if (f > t) {
    err.textContent = 'La fecha "Desde" no puede ser posterior a "Hasta".';
    err.classList.add("show");
    return;
  }
  // Si el rango coincide exacto con el mes actual, usa la vista completa del mes
  const now = new Date();
  const mode = (f === firstOfMonthISO(now) && t === lastOfMonthISO(now)) ? "currentMonth" : "custom";
  setPeriod(f, t, mode);
  closePeriod();
};

window.resetPeriod = () => {
  defaultPeriod();
  updatePeriodUI();
  renderAll();
};

const emptyState = (title, sub, cta) => `
  <div class="empty">
    <div class="empty-ic">${iconHtml("receipt-text")}</div>
    <div class="empty-title">${title}</div>
    <div class="empty-sub">${sub}</div>
    ${cta ? `<button class="empty-cta" onclick="openModal('expense')">${iconHtml("plus")}Registrar el primero</button>` : ''}
  </div>`;

function renderTxPreview() {
  const el = document.getElementById("tx-preview");
  const tx = txInPeriod();
  if (tx.length === 0) {
    el.innerHTML = allTransactions.length === 0
      ? emptyState("Aún no hay movimientos", "Registra tus gastos e ingresos para ver aquí tu actividad reciente.", true)
      : emptyState("Sin movimientos en este periodo", "No registraste nada entre estas fechas. Cambia el rango o agrega un movimiento.", true);
    renderIcons();
    return;
  }
  el.innerHTML = "";
  tx.slice(0, 4).forEach(t => el.appendChild(txItemEl(t)));
  renderIcons();
}

function renderTxFull() {
  const el = document.getElementById("tx-full");
  const tx = txInPeriod();
  if (tx.length === 0) {
    el.innerHTML = allTransactions.length === 0
      ? emptyState("Sin movimientos todavía", "Cuando registres gastos o ingresos aparecerán todos en esta lista.", true)
      : emptyState("Sin movimientos en este periodo", "Prueba con otro rango de fechas en el selector de arriba.", false);
    renderIcons();
    return;
  }
  el.innerHTML = "";
  tx.forEach(t => el.appendChild(txItemEl(t)));
  renderIcons();
}

function txItemEl(t) {
  const div = document.createElement("div");
  div.className = "tx-item";
  div.setAttribute("role", "button");
  div.setAttribute("tabindex", "0");
  div.setAttribute("aria-label", `Editar ${t.descripcion}`);
  div.onclick = () => openEditTx(t.id);
  div.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEditTx(t.id); } };
  const isIncome = t.tipo === "income";
  div.innerHTML = `
    <div class="tx-ic ${isIncome ? 'in' : ''}">${iconHtml(catIcon(t.categoria))}</div>
    <div class="tx-info">
      <div class="tx-name">${t.descripcion}</div>
      <div class="tx-cat">${t.categoria} · ${new Date(t.fecha + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</div>
    </div>
    <div class="tx-amt ${isIncome ? 'pos' : 'neg'}">${isIncome ? "+" : "−"}${fmt(t.monto)}</div>
    <span class="tx-chevron">${iconHtml("chevron-right")}</span>
  `;
  return div;
}

function renderChart() {
  const el = document.getElementById("chart-bars");
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("es-CO", { month: "short" }) });
  }
  const totals = months.map(m => {
    const sum = allTransactions.filter(t => t.tipo === "expense" && t.fecha.startsWith(m.key)).reduce((s, t) => s + t.monto, 0);
    return GASTOS_FIJOS_MENSUALES + sum;
  });
  const max = Math.max(...totals, 1);
  const budget = FLUJO_LIBRE_MENSUAL + GASTOS_FIJOS_MENSUALES; // 0 = sin presupuesto definido
  el.innerHTML = "";
  months.forEach((m, i) => {
    const h = Math.max(6, (totals[i] / max) * 130);
    const over = budget > 0 && totals[i] > budget;
    const col = document.createElement("div");
    col.className = "bar-col";
    col.innerHTML = `<div class="bar ${over ? 'over' : ''}" style="height:${h}px" title="${fmt(totals[i])}"></div><div class="bar-month">${m.label}</div>`;
    el.appendChild(col);
  });
}

// ============================================================
// DONUT — gastos por categoría (en qué se va la plata)
// Respeta el periodo activo: suma los gastos registrados en el rango.
// ============================================================
const PIE_COLORS = ["#34DDA0", "#5BA7F7", "#F2B95C", "#F26A5E", "#A78BFA", "#2DD4BF", "#F472B6", "#A3E635", "#FB923C", "#9AA4B2"];

function renderCategoryChart() {
  const el = document.getElementById("cat-chart");
  const gastos = txInPeriod().filter(t => t.tipo === "expense");

  if (gastos.length === 0) {
    el.innerHTML = `<div class="empty"><div class="empty-ic">${iconHtml("chart-pie")}</div><div class="empty-title">Sin gastos en este periodo</div><div class="empty-sub">Registra gastos para ver en qué se va la plata.</div></div>`;
    renderIcons();
    return;
  }

  // Sumar por categoría y ordenar de mayor a menor
  const byCat = {};
  gastos.forEach(t => { byCat[t.categoria] = (byCat[t.categoria] || 0) + t.monto; });
  const total = Object.values(byCat).reduce((a, b) => a + b, 0);
  const cats = Object.entries(byCat)
    .map(([name, val]) => ({ name, val, pct: (val / total) * 100 }))
    .sort((a, b) => b.val - a.val);

  // Segmentos del donut (SVG rotado -90°: el primero arranca arriba)
  let acc = 0;
  const segs = cats.map((c, i) => {
    c.color = PIE_COLORS[i % PIE_COLORS.length];
    const dash = `${c.pct.toFixed(2)} ${(100 - c.pct).toFixed(2)}`;
    const offset = (-acc).toFixed(2);
    acc += c.pct;
    return `<circle class="donut-seg" cx="21" cy="21" r="15.91549431" fill="transparent" stroke="${c.color}" stroke-width="4.5" stroke-dasharray="${dash}" stroke-dashoffset="${offset}"></circle>`;
  }).join("");

  const legend = cats.map(c => `
    <div class="legend-row">
      <span class="legend-dot" style="background:${c.color}"></span>
      <span class="legend-name">${c.name}</span>
      <span class="legend-pct">${Math.round(c.pct)}%</span>
      <span class="legend-amt">${fmt(c.val)}</span>
    </div>`).join("");

  el.innerHTML = `
    <div class="donut">
      <svg viewBox="0 0 42 42" class="donut-svg">
        <circle cx="21" cy="21" r="15.91549431" fill="transparent" stroke="var(--bg-elev)" stroke-width="4.5"></circle>
        ${segs}
      </svg>
      <div class="donut-center">
        <span class="donut-label">Gastos</span>
        <span class="donut-total">${fmt(total)}</span>
      </div>
    </div>
    <div class="legend">${legend}</div>`;
  renderIcons();
}

// ============================================================
// MODAL — registrar transacción
// ============================================================
window.openModal = (type) => {
  editingTxId = null;
  setTxType(type);
  document.getElementById("tx-date").value = todayISO();
  document.getElementById("tx-amount").value = "";
  document.getElementById("tx-desc").value = "";
  document.getElementById("modal-submit").innerHTML = `${iconHtml("check")}Guardar`;
  document.getElementById("tx-delete").classList.add("hide");
  document.getElementById("tx-type-seg").classList.remove("hide");
  document.getElementById("modal-bg").classList.add("show");
  renderIcons();
};

// Abre el mismo modal pero precargado con un movimiento existente para editarlo
window.openEditTx = (id) => {
  const t = allTransactions.find(x => x.id === id);
  if (!t) return;
  editingTxId = id;
  setTxType(t.tipo);
  document.getElementById("tx-amount").value = t.monto;
  document.getElementById("tx-desc").value = t.descripcion;
  document.getElementById("tx-date").value = t.fecha;
  // La categoría puede no existir ya en la lista (si la borraron): la añadimos como opción
  const sel = document.getElementById("tx-category");
  if (!Array.from(sel.options).some(o => o.value === t.categoria)) {
    sel.insertAdjacentHTML("beforeend", `<option value="${t.categoria}">${t.categoria}</option>`);
  }
  sel.value = t.categoria;
  document.getElementById("modal-title").textContent = "Editar movimiento";
  document.getElementById("modal-submit").innerHTML = `${iconHtml("check")}Guardar cambios`;
  document.getElementById("tx-delete").classList.remove("hide");
  document.getElementById("tx-type-seg").classList.add("hide"); // no cambiar gasto↔ingreso al editar
  document.getElementById("modal-bg").classList.add("show");
  renderIcons();
};

window.closeModalBg = (e) => {
  if (e.target.id === "modal-bg") document.getElementById("modal-bg").classList.remove("show");
};
window.setTxType = (type) => {
  currentTxType = type;
  document.getElementById("seg-expense").classList.toggle("active", type === "expense");
  document.getElementById("seg-income").classList.toggle("active", type === "income");
  document.getElementById("modal-title").textContent = type === "expense" ? "Registrar gasto" : "Registrar ingreso";
  const sel = document.getElementById("tx-category");
  const cats = type === "expense" ? categoriasGasto : categoriasIngreso;
  sel.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join("");
};

window.submitTransaction = async () => {
  const monto = parseFloat(document.getElementById("tx-amount").value);
  const descripcion = document.getElementById("tx-desc").value.trim();
  const categoria = document.getElementById("tx-category").value;
  const fecha = document.getElementById("tx-date").value || todayISO();

  if (!monto || monto <= 0 || !descripcion) {
    showToast("Completa monto y descripción", true);
    return;
  }

  try {
    if (editingTxId) {
      // Editar: solo cambian los campos editables (el tipo se conserva)
      await updateDoc(doc(db, "users", currentUser.uid, "transactions", editingTxId), {
        monto, descripcion, categoria, fecha
      });
      showToast("Movimiento actualizado");
    } else {
      await addDoc(collection(db, "users", currentUser.uid, "transactions"), {
        tipo: currentTxType, monto, descripcion, categoria, fecha,
        creadoEn: serverTimestamp()
      });
      showToast(currentTxType === "expense" ? "Gasto guardado" : "Ingreso guardado");
    }
    document.getElementById("modal-bg").classList.remove("show");
  } catch (e) {
    showToast("Error al guardar — revisa tu conexión", true);
  }
};

// Eliminar el movimiento que se está editando
window.deleteTransaction = async () => {
  if (!editingTxId) return;
  if (!confirm("¿Eliminar este movimiento? No se puede deshacer.")) return;
  try {
    await deleteDoc(doc(db, "users", currentUser.uid, "transactions", editingTxId));
    document.getElementById("modal-bg").classList.remove("show");
    showToast("Movimiento eliminado");
  } catch (e) {
    showToast("Error al eliminar — revisa tu conexión", true);
  }
};

let toastTimer = null;
function showToast(msg, isError = false) {
  const t = document.getElementById("toast");
  t.classList.toggle("err", isError);
  t.innerHTML = `${iconHtml(isError ? "circle-alert" : "circle-check")}<span>${msg}</span>`;
  renderIcons();
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

// ============================================================
// NAVEGACIÓN
// ============================================================
window.showView = (view) => {
  ["home", "debts", "sim", "history"].forEach(v => {
    document.getElementById("view-" + v).classList.toggle("hide", v !== view);
  });
  document.querySelectorAll(".nav-item").forEach(n => {
    n.classList.toggle("active", n.dataset.view === view);
  });
  // El selector de periodo solo aplica a Inicio e Historial
  document.getElementById("period-bar").classList.toggle("hide", !(view === "home" || view === "history"));
};

// ============================================================
// SIMULADOR — "qué hago con esta plata"
// Lógica basada en las reglas reales de Marcela:
// 1. Nubank no admite abono parcial → solo se recomienda si
//    el monto cubre el saldo TOTAL de alguna.
// 2. Si no alcanza para saldar ninguna, se recomienda ahorro
//    + fondo de vivienda + gasto libre.
// 3. Cesantías y ahorro permanente nunca se tocan ni se sugieren.
// ============================================================

// ============================================================
// CATEGORÍAS — cargar y guardar en Firestore
// ============================================================
async function loadCategories(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid, "meta", "categorias"));
    if (snap.exists()) {
      const data = snap.data();
      if (data.gasto && data.gasto.length > 0) categoriasGasto = data.gasto;
      if (data.ingreso && data.ingreso.length > 0) categoriasIngreso = data.ingreso;
      if (data.iconos) Object.assign(ICON_MAP, data.iconos);
    }
  } catch (e) {
    // Si falla usa los defaults, no pasa nada
  }
}

async function saveCategories() {
  if (!currentUser) return;
  await setDoc(doc(db, "users", currentUser.uid, "meta", "categorias"), {
    gasto: categoriasGasto,
    ingreso: categoriasIngreso,
    iconos: ICON_MAP
  });
}

// ---- Modal de gestión de categorías ----
let editingCatType = "expense"; // "expense" | "income"
let newCatIcon = ICON_CHOICES[0];
let editCatIcon = null;

// Selector de iconos Lucide (reemplaza el antiguo input de emoji)
const buildIconPicker = (selected, handler) =>
  ICON_CHOICES.map(name =>
    `<button type="button" class="icon-opt ${name === selected ? "sel" : ""}" onclick="${handler}('${name}', this)" aria-label="${name}">${iconHtml(name)}</button>`
  ).join("");

function pickIconUI(btn) {
  btn.parentElement.querySelectorAll(".icon-opt").forEach(o => o.classList.remove("sel"));
  btn.classList.add("sel");
}
window.selectNewCatIcon = (name, el) => { newCatIcon = name; pickIconUI(el); };
window.selectEditCatIcon = (name, el) => { editCatIcon = name; pickIconUI(el); };

window.openCatModal = (type) => {
  editingCatType = type || currentTxType;
  newCatIcon = ICON_CHOICES[0];
  document.getElementById("cat-new-name").value = "";
  document.getElementById("cat-icon-picker").innerHTML = buildIconPicker(newCatIcon, "selectNewCatIcon");
  renderCatList();
  document.getElementById("cat-modal-bg").classList.add("show");
};

window.closeCatModal = () => {
  document.getElementById("cat-modal-bg").classList.remove("show");
  // Refresca el select del modal principal
  setTxType(currentTxType);
};

window.switchCatTab = (type) => {
  editingCatType = type;
  document.getElementById("cat-tab-expense").classList.toggle("active", type === "expense");
  document.getElementById("cat-tab-income").classList.toggle("active", type === "income");
  renderCatList();
};

function renderCatList() {
  const cats = editingCatType === "expense" ? categoriasGasto : categoriasIngreso;
  const el = document.getElementById("cat-list");
  el.innerHTML = cats.map((cat, i) => `
    <div class="cat-item">
      <span class="cat-ic">${iconHtml(catIcon(cat))}</span>
      <span class="cat-name">${cat}</span>
      <div class="cat-actions">
        <button class="cat-btn" onclick="startEditCat(${i})" aria-label="Editar">${iconHtml("pencil")}</button>
        <button class="cat-btn del" onclick="deleteCat(${i})" aria-label="Eliminar">${iconHtml("trash-2")}</button>
      </div>
    </div>
  `).join("");
  renderIcons();
}

window.startEditCat = (i) => {
  const cats = editingCatType === "expense" ? categoriasGasto : categoriasIngreso;
  const origName = cats[i];
  editCatIcon = catIcon(origName);
  const el = document.getElementById("cat-list").children[i];
  el.innerHTML = `
    <div style="flex:1;min-width:0;">
      <input class="cat-inline-input" id="cat-edit-name-${i}" value="${origName}" style="width:100%;margin-bottom:9px;">
      <div class="icon-picker">${buildIconPicker(editCatIcon, "selectEditCatIcon")}</div>
    </div>
    <div class="cat-actions">
      <button class="cat-btn save" onclick="saveEditCat(${i})" aria-label="Guardar">${iconHtml("check")}</button>
      <button class="cat-btn" onclick="renderCatList()" aria-label="Cancelar">${iconHtml("x")}</button>
    </div>`;
  renderIcons();
  document.getElementById(`cat-edit-name-${i}`).focus();
};

window.saveEditCat = async (i) => {
  const newName = document.getElementById(`cat-edit-name-${i}`).value.trim();
  if (!newName) { showToast("El nombre no puede estar vacío", true); return; }

  const cats = editingCatType === "expense" ? categoriasGasto : categoriasIngreso;
  const oldName = cats[i];

  if (newName !== oldName && cats.includes(newName)) { showToast("Esa categoría ya existe", true); return; }

  // Actualizar el mapa de iconos
  ICON_MAP[newName] = editCatIcon || DEFAULT_ICON;
  if (oldName !== newName) delete ICON_MAP[oldName];

  cats[i] = newName;
  await saveCategories();
  showToast("Categoría actualizada");
  renderCatList();
};

window.deleteCat = async (i) => {
  const cats = editingCatType === "expense" ? categoriasGasto : categoriasIngreso;
  if (cats.length <= 1) { showToast("Debe quedar al menos una categoría", true); return; }
  const nombre = cats[i];
  if (!confirm(`¿Eliminar la categoría "${nombre}"? Los movimientos que la usaban conservarán ese nombre.`)) return;
  cats.splice(i, 1);
  await saveCategories();
  showToast("Categoría eliminada");
  renderCatList();
};

window.addNewCat = async () => {
  const nameInput = document.getElementById("cat-new-name");
  const name = nameInput.value.trim();
  if (!name) { showToast("Escribe un nombre para la categoría", true); return; }

  const cats = editingCatType === "expense" ? categoriasGasto : categoriasIngreso;
  if (cats.includes(name)) { showToast("Esa categoría ya existe", true); return; }

  ICON_MAP[name] = newCatIcon || DEFAULT_ICON;
  cats.push(name);
  await saveCategories();
  nameInput.value = "";
  showToast("Categoría creada");
  renderCatList();
};

// ============================================================
// SIMULADOR — "¿qué hago con esta plata?"
// ============================================================
window.runSimulation = () => {
  const monto = parseFloat(document.getElementById("sim-amount").value);
  const resultEl = document.getElementById("sim-result");
  if (!monto || monto <= 0) {
    showToast("Escribe un monto válido", true);
    return;
  }

  const nubankPortatil = debtsState.find(d => d.id === "nubank-portatil");
  const nubankDrop = debtsState.find(d => d.id === "nubank-dropshipping");
  const libranza = debtsState.find(d => d.id === "libranza");

  let plan = [];
  let restante = monto;
  let nota = "";

  // ¿Alcanza para saldar Nubank portátil completo? (la de menor saldo primero)
  if (nubankPortatil && restante >= nubankPortatil.saldo) {
    plan.push({ destino: `Saldar Nubank Portátil (saldo total)`, valor: nubankPortatil.saldo });
    restante -= nubankPortatil.saldo;
    nota = `Saldando esta deuda liberas ${fmt(nubankPortatil.cuotaMensual)}/mes de cuota. Como es tarjeta de tu mamá y no admite abono parcial, esta es la única forma de bajarla.`;
  }
  if (nubankDrop && restante >= nubankDrop.saldo) {
    plan.push({ destino: `Saldar Nubank Curso Dropshipping (saldo total)`, valor: nubankDrop.saldo });
    restante -= nubankDrop.saldo;
    nota += ` También te alcanza para saldar la del curso: +${fmt(nubankDrop.cuotaMensual)}/mes liberados.`;
  }

  if (plan.length === 0) {
    // No alcanza para saldar ninguna Nubank → repartir: ahorro vivienda, fondo emergencia, libre
    const aVivienda = Math.round(restante * 0.4);
    const aAhorro = Math.round(restante * 0.3);
    const aLibre = restante - aVivienda - aAhorro;
    plan.push({ destino: "Fondo para vivienda propia (aparte de cesantías)", valor: aVivienda });
    plan.push({ destino: "Ahorro / colchón de emergencia (DALE, 10,5% EA)", valor: aAhorro });
    plan.push({ destino: "Gasto libre / variables del mes", valor: aLibre });
    nota = `Este monto no alcanza para saldar ninguna Nubank completa (mínimo ${fmt(Math.min(nubankPortatil.saldo, nubankDrop.saldo))}). Recuerda: esas tarjetas no admiten abono parcial, así que mejor acumular hasta poder saldarlas de un solo golpe. Por ahora prioricé vivienda y colchón.`;
  } else if (restante > 0) {
    const aVivienda = Math.round(restante * 0.6);
    const aLibre = restante - aVivienda;
    plan.push({ destino: "Fondo para vivienda propia", valor: aVivienda });
    plan.push({ destino: "Gasto libre / disponible", valor: aLibre });
  }

  resultEl.innerHTML = `
    ${plan.map(p => `<div class="sim-line"><span class="lab">${p.destino}</span><span class="val">${fmt(p.valor)}</span></div>`).join("")}
    <div class="sim-note">${iconHtml("lightbulb")}<span>${nota}</span></div>
  `;
  resultEl.classList.add("show");
  renderIcons();
};
