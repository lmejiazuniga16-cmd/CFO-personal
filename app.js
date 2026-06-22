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
    color: "blue",
    debtType: "automatico"
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
    color: "amber",
    debtType: "tarjeta"
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
    color: "amber",
    debtType: "tarjeta"
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
    debtsState = snap.docs.map(d => {
      const data = d.data();
      if (!data.debtType) {
        data.debtType = "automatico";
      }
      return data;
    });
  }
  renderDebts();
  renderTimeline();
}

window.toggleDebtType = () => {
  const type = document.getElementById("debt-type").value;
  const isAuto = type === "automatico";
  
  // Detalle del pago mensual (referencia) - Apartado 2
  document.getElementById("debt-ref-fields-automatico").classList.toggle("hide", !isAuto);
  document.getElementById("debt-ref-fields-tarjeta").classList.toggle("hide", isAuto);
  
  // Abono parcial - Apartado 3
  document.getElementById("debt-abonoParcial-field-wrapper").classList.toggle("hide", !isAuto);
  
  toggleDebtAutoFields();
};

window.updateRefTotalAuto = () => {
  const cap = parseFloat(document.getElementById("debt-refCapital").value.replace(/\./g, '').replace(',', '.')) || 0;
  const int = parseFloat(document.getElementById("debt-refIntereses-auto").value.replace(/\./g, '').replace(',', '.')) || 0;
  const seg = parseFloat(document.getElementById("debt-refSeguro").value.replace(/\./g, '').replace(',', '.')) || 0;
  const otr = parseFloat(document.getElementById("debt-refOtros").value.replace(/\./g, '').replace(',', '.')) || 0;
  
  let extraSum = 0;
  const extraRows = document.querySelectorAll(".ref-concepto-extra-value");
  extraRows.forEach(input => {
    extraSum += parseFloat(input.value.replace(/\./g, '').replace(',', '.')) || 0;
  });
  
  const total = cap + int + seg + otr + extraSum;
  document.getElementById("debt-refTotal-auto").value = total;
  
  if (typeof syncDebitFieldsFromRef === "function") {
    syncDebitFieldsFromRef();
  }
};

window.updateRefTotalTarjeta = () => {
  const abono = parseFloat(document.getElementById("debt-refAbono").value.replace(/\./g, '').replace(',', '.')) || 0;
  const int = parseFloat(document.getElementById("debt-refIntereses-tarjeta").value.replace(/\./g, '').replace(',', '.')) || 0;
  const total = abono + int;
  document.getElementById("debt-refTotal-tarjeta").value = total;
};

window.addRefConceptoExtraRow = (name = "", value = 0) => {
  const container = document.getElementById("debt-refConceptosExtra-container");
  if (!container) return;
  
  const div = document.createElement("div");
  div.className = "flex-row ref-concepto-extra-row";
  div.style = "display: flex; gap: 8px; margin-bottom: 8px; align-items: center;";
  div.innerHTML = `
    <input type="text" class="ref-concepto-extra-name" placeholder="Concepto extra" value="${name}" style="flex: 2; padding: 8px 12px; border-radius: 9px; border: 1px solid var(--line); background: var(--surface);">
    <input type="number" class="ref-concepto-extra-value" placeholder="Monto" value="${value || ''}" oninput="updateRefTotalAuto()" style="flex: 1; padding: 8px 12px; border-radius: 9px; border: 1px solid var(--line); background: var(--surface); text-align: right; font-family: var(--f-mono);">
    <button type="button" class="btn-delete-refConceptoExtra" style="background: transparent; border: none; color: var(--red); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 6px; border-radius: 8px;">
      <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
    </button>
  `;
  
  div.querySelector(".btn-delete-refConceptoExtra").onclick = () => {
    div.remove();
    updateRefTotalAuto();
  };
  
  container.appendChild(div);
  renderIcons();
  if (typeof initMoneyInput === "function") {
    initMoneyInput(div.querySelector(".ref-concepto-extra-value"));
  }
  updateRefTotalAuto();
};

window.setAbonoParcial = (val) => {
  document.getElementById("btn-abonoParcial-yes").classList.toggle("active", val);
  document.getElementById("btn-abonoParcial-no").classList.toggle("active", !val);
};

window.setAutomaticDebit = (val) => {
  document.getElementById("btn-automaticDebit-yes").classList.toggle("active", val);
  document.getElementById("btn-automaticDebit-no").classList.toggle("active", !val);
  toggleDebtAutoFields();
};

window.setDebitSameValues = (val) => {
  document.getElementById("btn-debitSameValues-yes").classList.toggle("active", val);
  document.getElementById("btn-debitSameValues-no").classList.toggle("active", !val);
  window.renderDebitCuotasConfig();
};

window.openDebtModal = (id) => {
  editingDebtId = id;
  
  let debt;
  if (id === 'nueva') {
    debt = {
      nombre: "",
      saldo: 0,
      tasaEA: 0,
      pago: "",
      abonoParcial: false,
      automaticDebit: false,
      debitPaymentsPerMonth: 1,
      debitStartDate: "",
      debitSameValues: true,
      refCapital: 0,
      refIntereses: 0,
      refSeguro: 0,
      refOtros: 0,
      cuotasRestantes: "",
      fechaFin: "",
      refAbono: 0,
      refConceptosExtra: [],
      debtType: "automatico"
    };
    document.getElementById("debt-modal-title").textContent = `Nueva Deuda`;
  } else {
    debt = debtsState.find(d => d.id === id);
    if (!debt) return;
    document.getElementById("debt-modal-title").textContent = `Editar deuda`;
  }
  
  const type = debt.debtType || "automatico";
  document.getElementById("debt-type").value = type;
  
  // Common fields
  document.getElementById("debt-name").value = debt.nombre || "";
  document.getElementById("debt-saldo").value = debt.saldo || 0;
  document.getElementById("debt-tasaEA").value = debt.tasaEA || 0;
  document.getElementById("debt-pago").value = debt.pago || "";
  
  // Apartado 3 toggles
  window.setAbonoParcial(Boolean(debt.abonoParcial));
  window.setAutomaticDebit(Boolean(debt.automaticDebit));
  
  // Apartado 4 inputs
  document.getElementById("debt-debitPaymentsPerMonth").value = debt.debitPaymentsPerMonth || 1;
  document.getElementById("debt-debitStartDate").value = debt.debitStartDate || "";
  window.setDebitSameValues(debt.debitSameValues !== undefined ? debt.debitSameValues : true);
  
  // Automatico specific
  document.getElementById("debt-refCapital").value = debt.refCapital || "";
  document.getElementById("debt-refIntereses-auto").value = debt.refIntereses || "";
  document.getElementById("debt-refSeguro").value = debt.refSeguro || "";
  document.getElementById("debt-refOtros").value = debt.refOtros || "";
  document.getElementById("debt-cuotas-auto").value = debt.cuotasRestantes || "";
  document.getElementById("debt-fechaFin-auto").value = debt.fechaFin || "";
  
  // Tarjeta specific
  document.getElementById("debt-refAbono").value = debt.refAbono || "";
  document.getElementById("debt-refIntereses-tarjeta").value = debt.refIntereses || "";
  document.getElementById("debt-cuotas-tarjeta").value = debt.cuotasRestantes || "";
  document.getElementById("debt-fechaFin-tarjeta").value = debt.fechaFin || "";
  
  // Reset and rebuild extra concepts
  const extraContainer = document.getElementById("debt-refConceptosExtra-container");
  if (extraContainer) extraContainer.innerHTML = "";
  if (debt.refConceptosExtra && Array.isArray(debt.refConceptosExtra)) {
    debt.refConceptosExtra.forEach(c => {
      window.addRefConceptoExtraRow(c.nombre, c.valor);
    });
  }
  
  // Run toggles and calculations
  toggleDebtType();
  updateRefTotalAuto();
  updateRefTotalTarjeta();
  
  // Show delete button
  const deleteBtn = document.getElementById("debt-delete-btn");
  if (deleteBtn) {
    deleteBtn.classList.toggle("hide", id === 'nueva');
  }
  
  // Setup saved debit concepts data
  const savedDebitData = {
    debitDates: [],
    debitConcepts: {}
  };
  const numCuotas = debt.debitPaymentsPerMonth || 1;
  for (let i = 1; i <= numCuotas; i++) {
    savedDebitData.debitDates.push(debt[`debitDate${i}`] || "");
    savedDebitData.debitConcepts[i] = debt[`debitConcepts${i}`] || [];
  }
  
  toggleDebtAutoFields(savedDebitData);
  
  document.getElementById("debt-modal-bg").classList.add("show");
  renderIcons();
};

function getRefConceptsList() {
  const list = [];
  const cap = parseFloat(document.getElementById("debt-refCapital").value.replace(/\./g, '').replace(',', '.')) || 0;
  const int = parseFloat(document.getElementById("debt-refIntereses-auto").value.replace(/\./g, '').replace(',', '.')) || 0;
  const seg = parseFloat(document.getElementById("debt-refSeguro").value.replace(/\./g, '').replace(',', '.')) || 0;
  const otr = parseFloat(document.getElementById("debt-refOtros").value.replace(/\./g, '').replace(',', '.')) || 0;
  
  list.push({ nombre: "Abono a capital", valor: cap });
  list.push({ nombre: "Intereses corrientes", valor: int });
  list.push({ nombre: "Seguro vida deudor", valor: seg });
  list.push({ nombre: "Otros conceptos", valor: otr });
  
  const extraRows = document.querySelectorAll(".ref-concepto-extra-row");
  extraRows.forEach(row => {
    const nameInput = row.querySelector(".ref-concepto-extra-name");
    const valInput = row.querySelector(".ref-concepto-extra-value");
    if (nameInput && valInput) {
      const name = nameInput.value.trim();
      const val = parseFloat(valInput.value.replace(/\./g, '').replace(',', '.')) || 0;
      if (name) {
        list.push({ nombre: name, valor: val });
      }
    }
  });
  return list;
}

function harvestDebitConfigFromDOM() {
  const data = {
    dates: {},
    concepts: {}
  };
  
  const dateInputs = document.querySelectorAll(".debit-cuota-date");
  dateInputs.forEach(input => {
    const idx = input.dataset.index;
    if (idx) {
      data.dates[idx] = input.value || "";
    }
  });
  
  const conceptRows = document.querySelectorAll(".debit-concept-row");
  conceptRows.forEach(row => {
    const cuotaIdx = row.dataset.cuotaIndex;
    const name = row.dataset.conceptName;
    const input = row.querySelector(".debit-concept-val");
    if (cuotaIdx && name && input) {
      if (!data.concepts[cuotaIdx]) {
        data.concepts[cuotaIdx] = [];
      }
      data.concepts[cuotaIdx].push({
        nombre: name,
        valor: parseFloat(input.value.replace(/\./g, '').replace(',', '.')) || 0
      });
    }
  });
  
  return data;
}

function mergeConcepts(refConcepts, existingConcepts) {
  return refConcepts.map(ref => {
    const matched = existingConcepts.find(c => c.nombre === ref.nombre);
    return {
      nombre: ref.nombre,
      valor: matched ? matched.valor : ref.valor
    };
  });
}

window.cleanNumberInput = (input) => {
  let val = input.value;
  if (val.length > 1 && val.startsWith('0')) {
    let parsed = parseInt(val, 10);
    input.value = isNaN(parsed) ? 0 : parsed;
  }
};

window.handleNumberPaste = (e) => {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text');
  const clean = parseInt(text.replace(/\D/g, ''), 10);
  e.target.value = isNaN(clean) ? 0 : clean;
  e.target.dispatchEvent(new Event('input'));
};

window.renderDebitCuotasConfig = (savedData = null) => {
  const container = document.getElementById("debt-debit-cuotas-config-container");
  if (!container) return;
  
  const payments = Number(document.getElementById("debt-debitPaymentsPerMonth").value) || 1;
  const sameValues = document.getElementById("btn-debitSameValues-yes").classList.contains("active");
  
  // Get current reference concepts
  const refConcepts = getRefConceptsList();
  
  // Harvest current DOM values to preserve user inputs
  const currentDOM = harvestDebitConfigFromDOM();
  
  let html = "";
  
  if (sameValues) {
    let date1 = "";
    if (savedData && savedData.debitDates && savedData.debitDates[0]) {
      date1 = savedData.debitDates[0];
    } else if (currentDOM.dates[1]) {
      date1 = currentDOM.dates[1];
    } else {
      const debt = editingDebtId ? debtsState.find(d => d.id === editingDebtId) : null;
      if (debt && debt.debitDay1) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(debt.debitDay1).padStart(2, '0');
        date1 = `${yyyy}-${mm}-${dd}`;
      }
    }
    
    let concepts1 = [];
    if (savedData && savedData.debitConcepts && savedData.debitConcepts[1] && savedData.debitConcepts[1].length > 0) {
      concepts1 = mergeConcepts(refConcepts, savedData.debitConcepts[1]);
    } else if (currentDOM.concepts[1] && currentDOM.concepts[1].length > 0) {
      concepts1 = mergeConcepts(refConcepts, currentDOM.concepts[1]);
    } else {
      concepts1 = JSON.parse(JSON.stringify(refConcepts));
    }
    
    const total1 = concepts1.reduce((sum, c) => sum + c.valor, 0);
    
    html += `
      <div style="background: var(--bg-elev); padding: 12px; border-radius: 10px; border: 1px solid var(--line); margin-bottom: 12px;">
        <div style="font-weight: bold; color: var(--gold); margin-bottom: 10px; font-size: 13px;">Valores por cuota</div>
        
        <div class="field compact-field">
          <div class="field-label">Día del mes</div>
          <input type="date" id="debit-date-1" class="debit-cuota-date" data-index="1" value="${date1}">
        </div>
        
        <div style="margin-top: 10px;">
    `;
    
    concepts1.forEach(c => {
      html += `
        <div class="flex-row debit-concept-row" data-cuota-index="1" data-concept-name="${c.nombre}" style="display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 8px;">
          <span style="font-size: 13px; color: var(--text-2); flex: 2;">${c.nombre}</span>
          <input type="number" class="debit-concept-val" value="${c.valor}" oninput="cleanNumberInput(this); updateDebitTotal(1)" onpaste="handleNumberPaste(event)" onfocus="this.select()" style="flex: 1; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--text); text-align: right; font-family: var(--f-mono); font-size: 13px;">
        </div>
      `;
    });
    
    html += `
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--line); padding-top: 8px; margin-top: 8px;">
          <span style="font-weight: bold; font-size: 13px; color: var(--text);">Total por cuota</span>
          <input type="number" id="debit-total-1" readonly value="${total1}" style="width: 120px; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); text-align: right; font-family: var(--f-mono); font-weight: bold; font-size: 13px;">
        </div>
      </div>
    `;
  } else {
    for (let i = 1; i <= payments; i++) {
      let dateVal = "";
      if (savedData && savedData.debitDates && savedData.debitDates[i - 1]) {
        dateVal = savedData.debitDates[i - 1];
      } else if (currentDOM.dates[i]) {
        dateVal = currentDOM.dates[i];
      } else {
        const debt = editingDebtId ? debtsState.find(d => d.id === editingDebtId) : null;
        if (debt && debt[`debitDay${i}`]) {
          const today = new Date();
          const yyyy = today.getFullYear();
          const mm = String(today.getMonth() + 1).padStart(2, '0');
          const dd = String(debt[`debitDay${i}`]).padStart(2, '0');
          dateVal = `${yyyy}-${mm}-${dd}`;
        }
      }
      
      let conceptsVal = [];
      if (savedData && savedData.debitConcepts && savedData.debitConcepts[i] && savedData.debitConcepts[i].length > 0) {
        conceptsVal = mergeConcepts(refConcepts, savedData.debitConcepts[i]);
      } else if (currentDOM.concepts[i] && currentDOM.concepts[i].length > 0) {
        conceptsVal = mergeConcepts(refConcepts, currentDOM.concepts[i]);
      } else {
        conceptsVal = JSON.parse(JSON.stringify(refConcepts));
      }
      
      const totalVal = conceptsVal.reduce((sum, c) => sum + c.valor, 0);
      
      html += `
        <div style="background: var(--bg-elev); padding: 12px; border-radius: 10px; border: 1px solid var(--line); margin-bottom: 12px;">
          <div style="font-weight: bold; color: var(--gold); margin-bottom: 10px; font-size: 13px;">Cuota ${i}</div>
          
          <div class="field compact-field">
            <div class="field-label">Fecha de la cuota</div>
            <input type="date" id="debit-date-${i}" class="debit-cuota-date" data-index="${i}" value="${dateVal}">
          </div>
          
          <div style="margin-top: 10px;">
      `;
      
      conceptsVal.forEach(c => {
        html += `
          <div class="flex-row debit-concept-row" data-cuota-index="${i}" data-concept-name="${c.nombre}" style="display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 8px;">
            <span style="font-size: 13px; color: var(--text-2); flex: 2;">${c.nombre}</span>
            <input type="number" class="debit-concept-val" value="${c.valor}" oninput="cleanNumberInput(this); updateDebitTotal(${i})" onpaste="handleNumberPaste(event)" onfocus="this.select()" style="flex: 1; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--text); text-align: right; font-family: var(--f-mono); font-size: 13px;">
          </div>
        `;
      });
      
      html += `
          </div>
          
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--line); padding-top: 8px; margin-top: 8px;">
            <span style="font-weight: bold; font-size: 13px; color: var(--text);">Total Cuota ${i}</span>
            <input type="number" id="debit-total-${i}" readonly value="${totalVal}" style="width: 120px; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); text-align: right; font-family: var(--f-mono); font-weight: bold; font-size: 13px;">
          </div>
        </div>
      `;
    }
  }
  
  container.innerHTML = html;
  renderIcons();
  container.querySelectorAll('.debit-concept-val').forEach(input => {
    if (typeof initMoneyInput === "function") {
      initMoneyInput(input);
    }
  });
  container.querySelectorAll('[id^="debit-total-"]').forEach(input => {
    if (typeof initMoneyInput === "function") {
      initMoneyInput(input);
    }
  });
};

window.updateDebitTotal = (index) => {
  const rows = document.querySelectorAll(`.debit-concept-row[data-cuota-index="${index}"] .debit-concept-val`);
  let sum = 0;
  rows.forEach(r => {
    sum += parseFloat(r.value.replace(/\./g, '').replace(',', '.')) || 0;
  });
  const totalInput = document.getElementById(`debit-total-${index}`);
  if (totalInput) {
    totalInput.value = sum;
  }
};

function syncDebitFieldsFromRef() {
  const auto = document.getElementById("btn-automaticDebit-yes").classList.contains("active");
  if (auto) {
    window.renderDebitCuotasConfig();
  }
}

window.handleDebitPaymentsPerMonthChange = () => {
  window.renderDebitCuotasConfig();
};

window.handleSameValuesChange = () => {
  window.renderDebitCuotasConfig();
};

window.toggleDebtAutoFields = (savedDebitData = null) => {
  const auto = document.getElementById("btn-automaticDebit-yes").classList.contains("active");
  document.getElementById("debt-section-auto").classList.toggle("hide", !auto);
  if (auto) {
    window.renderDebitCuotasConfig(savedDebitData);
  }
};

window.saveDebt = async () => {
  if (!currentUser || !editingDebtId) return;
  
  const type = document.getElementById("debt-type").value;
  const nombre = document.getElementById("debt-name").value.trim();
  const saldo = parseFloat(document.getElementById("debt-saldo").value.replace(/\./g, '').replace(',', '.')) || 0;
  const tasaEA = parseFloat(document.getElementById("debt-tasaEA").value);
  const pago = document.getElementById("debt-pago").value.trim();
  
  if (!nombre || isNaN(saldo) || !pago) {
    showToast("Completa nombre, saldo y descripción de pago", true);
    return;
  }
  
  let debtId;
  let debt;
  if (editingDebtId === 'nueva') {
    const slugId = nombre.toLowerCase()
                         .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                         .replace(/\s+/g, '-')
                         .replace(/[^\w\-]/g, '');
    debtId = slugId;
    if (debtsState.some(d => d.id === debtId)) {
      debtId += '-' + Math.floor(Math.random() * 1000);
    }
    debt = {
      id: debtId,
      saldoOriginal: saldo,
      color: ['blue', 'emerald', 'amber', 'sky', 'purple', 'pink'][Math.floor(Math.random() * 6)]
    };
  } else {
    debt = debtsState.find(d => d.id === editingDebtId);
    if (!debt) return;
  }
  
  // Asignación de color: conserva el color existente o asigna uno aleatorio
  let color = debt.color;
  if (!color) {
    const palette = ['blue', 'emerald', 'amber', 'sky', 'purple', 'pink'];
    color = palette[Math.floor(Math.random() * palette.length)];
  }
  
  const abonoParcial = document.getElementById("btn-abonoParcial-yes").classList.contains("active");
  const automaticDebit = document.getElementById("btn-automaticDebit-yes").classList.contains("active");
  const debitStartDate = document.getElementById("debt-debitStartDate").value || null;
  const debitPaymentsPerMonth = Number(document.getElementById("debt-debitPaymentsPerMonth").value) || 1;
  const debitSameValues = document.getElementById("btn-debitSameValues-yes").classList.contains("active");
  
  if (!nombre || isNaN(saldo) || !pago) {
    showToast("Completa nombre, saldo y descripción de pago", true);
    return;
  }
  
  let debitDay1 = 0;
  let debitDay2 = 0;
  let debitAmount1 = 0;
  let debitAmount2 = 0;
  let debitConcepts1 = [];
  let debitConcepts2 = [];
  
  // Objeto base payload con limpieza de campos antiguos y soporte dinamico
  let payload = {
    ...debt,
    nombre,
    saldo,
    tasaEA: isNaN(tasaEA) ? debt.tasaEA : tasaEA,
    pago,
    color,
    debtType: type,
    automaticDebit,
    debitStartDate: automaticDebit ? debitStartDate : null,
    debitPaymentsPerMonth: automaticDebit ? debitPaymentsPerMonth : 1,
    debitSameValues: automaticDebit ? debitSameValues : true,
  };
  
  // Limpieza de campos dinámicos previos (para evitar acumular basura si se reduce la cantidad de cuotas)
  for (let i = 1; i <= 20; i++) {
    delete payload[`debitDay${i}`];
    delete payload[`debitAmount${i}`];
    delete payload[`debitDate${i}`];
    delete payload[`debitConcepts${i}`];
  }
  
  if (automaticDebit) {
    if (debitSameValues) {
      const dateStr1 = document.getElementById("debit-date-1")?.value || "";
      debitDay1 = dateStr1 ? new Date(dateStr1 + "T12:00:00").getDate() : 1;
      
      const c1Rows = document.querySelectorAll(`.debit-concept-row[data-cuota-index="1"]`);
      c1Rows.forEach(row => {
        const name = row.dataset.conceptName;
        const valInput = row.querySelector(".debit-concept-val");
        if (name && valInput) {
          debitConcepts1.push({ nombre: name, valor: parseFloat(valInput.value.replace(/\./g, '').replace(',', '.')) || 0 });
        }
      });
      debitAmount1 = debitConcepts1.reduce((sum, c) => sum + c.valor, 0);
      
      // Para valores iguales, replicar a todas las cuotas
      for (let i = 1; i <= debitPaymentsPerMonth; i++) {
        payload[`debitDate${i}`] = dateStr1;
        payload[`debitDay${i}`] = debitDay1;
        payload[`debitAmount${i}`] = debitAmount1;
        payload[`debitConcepts${i}`] = JSON.parse(JSON.stringify(debitConcepts1));
      }
      
      debitDay2 = debitDay1;
      debitAmount2 = debitAmount1;
      debitConcepts2 = JSON.parse(JSON.stringify(debitConcepts1));
      
    } else {
      // Diferentes valores
      for (let i = 1; i <= debitPaymentsPerMonth; i++) {
        const dateStr = document.getElementById(`debit-date-${i}`)?.value || "";
        const day = dateStr ? new Date(dateStr + "T12:00:00").getDate() : 1;
        
        const concepts = [];
        const rows = document.querySelectorAll(`.debit-concept-row[data-cuota-index="${i}"]`);
        rows.forEach(row => {
          const name = row.dataset.conceptName;
          const valInput = row.querySelector(".debit-concept-val");
          if (name && valInput) {
            concepts.push({ nombre: name, valor: parseFloat(valInput.value.replace(/\./g, '').replace(',', '.')) || 0 });
          }
        });
        const amount = concepts.reduce((sum, c) => sum + c.valor, 0);
        
        payload[`debitDate${i}`] = dateStr;
        payload[`debitDay${i}`] = day;
        payload[`debitAmount${i}`] = amount;
        payload[`debitConcepts${i}`] = concepts;
        
        if (i === 1) {
          debitDay1 = day;
          debitAmount1 = amount;
          debitConcepts1 = concepts;
        } else if (i === 2) {
          debitDay2 = day;
          debitAmount2 = amount;
          debitConcepts2 = concepts;
        }
      }
    }
    
    if (debitAmount1 <= 0) {
      showToast("Define un monto de débito automático válido", true);
      return;
    }
  }
  
  // Agregar compatibilidad para el array debits
  const debitsCompat = [];
  if (automaticDebit) {
    for (let i = 1; i <= debitPaymentsPerMonth; i++) {
      debitsCompat.push({
        day: payload[`debitDay${i}`] || 1,
        amount: payload[`debitAmount${i}`] || 0
      });
    }
  }
  payload.debits = debitsCompat;
  payload.debitDay1 = automaticDebit ? debitDay1 : 0;
  payload.debitAmount1 = automaticDebit ? debitAmount1 : 0;
  payload.debitDay2 = automaticDebit ? debitDay2 : 0;
  payload.debitAmount2 = automaticDebit ? debitAmount2 : 0;
  payload.debitConcepts1 = automaticDebit ? debitConcepts1 : [];
  payload.debitConcepts2 = automaticDebit ? debitConcepts2 : [];
  
  if (type === "automatico") {
    const refCapital = parseFloat(document.getElementById("debt-refCapital").value.replace(/\./g, '').replace(',', '.')) || 0;
    const refIntereses = parseFloat(document.getElementById("debt-refIntereses-auto").value.replace(/\./g, '').replace(',', '.')) || 0;
    const refSeguro = parseFloat(document.getElementById("debt-refSeguro").value.replace(/\./g, '').replace(',', '.')) || 0;
    const refOtros = parseFloat(document.getElementById("debt-refOtros").value.replace(/\./g, '').replace(',', '.')) || 0;
    
    const refConceptosExtra = [];
    const extraRows = document.querySelectorAll(".ref-concepto-extra-row");
    extraRows.forEach(row => {
      const nameInput = row.querySelector(".ref-concepto-extra-name");
      const valInput = row.querySelector(".ref-concepto-extra-value");
      if (nameInput && valInput) {
        const nombreExtra = nameInput.value.trim();
        const valorExtra = parseFloat(valInput.value.replace(/\./g, '').replace(',', '.')) || 0;
        if (nombreExtra && valorExtra > 0) {
          refConceptosExtra.push({ nombre: nombreExtra, valor: valorExtra });
        }
      }
    });
    
    const cuotaMensual = parseFloat(document.getElementById("debt-refTotal-auto").value.replace(/\./g, '').replace(',', '.')) || 0;
    const cuotasRestantes = parseInt(document.getElementById("debt-cuotas-auto").value, 10);
    const fechaFin = document.getElementById("debt-fechaFin-auto").value || null;
    
    payload = {
      ...payload,
      refCapital,
      refIntereses,
      refSeguro,
      refOtros,
      refConceptosExtra,
      refAbono: 0,
      abonoParcial,
      cuotaMensual,
      cuotasRestantes: isNaN(cuotasRestantes) ? Math.max(0, Math.ceil(saldo / (cuotaMensual || 1))) : cuotasRestantes,
      fechaFin,
    };
  } else {
    // Tarjeta
    const refAbono = parseFloat(document.getElementById("debt-refAbono").value.replace(/\./g, '').replace(',', '.')) || 0;
    const refIntereses = parseFloat(document.getElementById("debt-refIntereses-tarjeta").value.replace(/\./g, '').replace(',', '.')) || 0;
    const cuotaMensual = parseFloat(document.getElementById("debt-refTotal-tarjeta").value.replace(/\./g, '').replace(',', '.')) || 0;
    const cuotasRestantes = parseInt(document.getElementById("debt-cuotas-tarjeta").value, 10);
    const fechaFin = document.getElementById("debt-fechaFin-tarjeta").value || null;
    
    payload = {
      ...payload,
      refAbono,
      refIntereses,
      refCapital: 0,
      refSeguro: 0,
      refOtros: 0,
      refConceptosExtra: [],
      abonoParcial: false,
      cuotaMensual,
      cuotasRestantes: isNaN(cuotasRestantes) ? Math.max(0, Math.ceil(saldo / (cuotaMensual || 1))) : cuotasRestantes,
      fechaFin,
    };
  }
  
  try {
    await setDoc(doc(db, "users", currentUser.uid, "debts", debt.id), payload);
    showToast(editingDebtId === 'nueva' ? "Deuda creada" : "Deuda actualizada");
    closeDebtModal();
    await loadDebtsState(currentUser.uid);
  } catch (e) {
    showToast("Error al guardar deuda", true);
  }
};

function closeDebtModal() {
  document.getElementById("debt-modal-bg").classList.remove("show");
}
window.closeDebtModal = closeDebtModal;

window.deleteDebt = async () => {
  if (!currentUser || !editingDebtId) return;
  if (!confirm("¿Eliminar esta deuda? Esta acción no se puede deshacer.")) return;
  try {
    await deleteDoc(doc(db, "users", currentUser.uid, "debts", editingDebtId));
    showToast("Deuda eliminada");
    closeDebtModal();
    await loadDebtsState(currentUser.uid);
  } catch (e) {
    showToast("Error al eliminar deuda", true);
  }
};

// Modal-based debt payment flow with type selector
let _payingDebtId = null;
let _paymentType = "monthly"; // 'monthly' or 'extra'

function addMonthsToDate(date, months) {
  const result = new Date(date);
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() !== day) {
    result.setDate(0);
  }
  return result;
}

function formatISODate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

window.registerDebtPayment = (id) => {
  const debt = debtsState.find(d => d.id === id);
  if (!debt) return;
  _payingDebtId = id;
  
  const type = debt.debtType || "automatico";
  if (type === "tarjeta") {
    openTarjetaPayModal(id);
  } else {
    _paymentType = "monthly";
    openDebtPayModal(debt);
  }
};

window.openTarjetaPayModal = (id) => {
  const debt = debtsState.find(d => d.id === id);
  if (!debt) return;
  _payingDebtId = id;
  
  const existing = document.getElementById('debt-pay-modal-bg');
  if (existing) existing.remove();
  
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
  <div class="modal-bg show" id="debt-pay-modal-bg" onclick="if(event.target.id==='debt-pay-modal-bg') closeDebtPayModal()">
    <div class="modal" style="max-height: 90vh;">
      <div class="modal-handle"></div>
      <div class="modal-title">Registrar pago TC — ${debt.nombre}</div>
      
      <div class="field">
        <div class="field-label">Fecha del pago</div>
        <input type="date" id="tarjeta-pay-date" value="${todayISO()}" onchange="updateTarjetaPaySummary()">
      </div>
      
      <div class="field">
        <div class="field-label">Abono a la deuda (COP)</div>
        <input type="number" inputmode="numeric" id="tarjeta-pay-abono" value="${debt.refAbono || ''}" oninput="updateTarjetaPaySummary()" placeholder="0">
      </div>
      
      <div class="field">
        <div class="field-label">Intereses (COP)</div>
        <input type="number" inputmode="numeric" id="tarjeta-pay-intereses" value="${debt.refIntereses || ''}" oninput="updateTarjetaPaySummary()" placeholder="0">
      </div>
      
      <div class="field">
        <div class="field-label">Total</div>
        <input type="number" id="tarjeta-pay-total" readonly style="background: var(--surface); color: var(--text-2); font-weight: bold;">
      </div>
      
      <div class="field-label" style="margin-top: 15px; margin-bottom: 5px;">Resumen del pago</div>
      <div id="tarjeta-pay-summary" style="padding: 14px; background: var(--surface); border-radius: 12px; border: 1px solid var(--line); font-size: 13px; line-height: 1.6;">
      </div>
      
      <div style="display:flex;gap:10px;margin-top:16px;">
        <button class="modal-submit" id="debt-pay-confirm" onclick="confirmTarjetaPayment()">${iconHtml("check")}Confirmar</button>
        <button class="modal-delete" onclick="closeDebtPayModal()">${iconHtml("x")}Cancelar</button>
      </div>
    </div>
  </div>`;
  
  document.body.appendChild(wrapper.firstElementChild);
  renderIcons();
  
  updateTarjetaPaySummary();
};

window.updateTarjetaPaySummary = () => {
  const abono = parseFloat(document.getElementById("tarjeta-pay-abono").value) || 0;
  const intereses = parseFloat(document.getElementById("tarjeta-pay-intereses").value) || 0;
  const total = abono + intereses;
  
  document.getElementById("tarjeta-pay-total").value = total;
  
  const debt = debtsState.find(d => d.id === _payingDebtId);
  if (!debt) return;
  
  const nuevoSaldo = Math.max(0, debt.saldo - abono);
  const cuotaMensual = debt.cuotaMensual || 1;
  const nuevasCuotas = Math.ceil(nuevoSaldo / cuotaMensual);
  
  const dateLimit = addMonthsToDate(new Date(), nuevasCuotas);
  const nuevaFechaFin = formatISODate(dateLimit);
  
  const summaryEl = document.getElementById("tarjeta-pay-summary");
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div style="margin-bottom: 4px; display: flex; justify-content: space-between;">
        <span style="color: var(--text-2);">Gasto registrado:</span>
        <strong style="color: var(--brand); font-family: var(--f-mono);">${fmt(total)}</strong>
      </div>
      <div style="margin-bottom: 4px; display: flex; justify-content: space-between;">
        <span style="color: var(--text-2);">Abono al saldo:</span>
        <strong style="color: var(--gold); font-family: var(--f-mono);">${fmt(abono)}</strong>
      </div>
      <div style="margin-bottom: 4px; display: flex; justify-content: space-between;">
        <span style="color: var(--text-2);">Nuevo saldo estimado:</span>
        <strong style="font-family: var(--f-mono);">${fmt(nuevoSaldo)}</strong>
      </div>
      <div style="margin-bottom: 4px; display: flex; justify-content: space-between;">
        <span style="color: var(--text-2);">Cuotas restantes:</span>
        <strong style="font-family: var(--f-mono);">${nuevasCuotas} meses</strong>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--text-2);">Fecha fin estimada:</span>
        <strong style="font-family: var(--f-mono);">${nuevaFechaFin}</strong>
      </div>
    `;
  }
};

window.confirmTarjetaPayment = async () => {
  const id = _payingDebtId;
  if (!id) return closeDebtPayModal();
  const debt = debtsState.find(d => d.id === id);
  if (!debt) return closeDebtPayModal();
  
  const fecha = document.getElementById("tarjeta-pay-date").value || todayISO();
  const abono = parseFloat(document.getElementById("tarjeta-pay-abono").value);
  const intereses = parseFloat(document.getElementById("tarjeta-pay-intereses").value);
  
  if (isNaN(abono) || abono < 0 || isNaN(intereses) || intereses < 0) {
    showToast("Los montos no pueden estar vacíos ni ser negativos", true);
    return;
  }
  
  const total = abono + intereses;
  if (total <= 0) {
    showToast("El monto total debe ser mayor a 0", true);
    return;
  }
  
  closeDebtPayModal();
  
  if (!currentUser) return;
  if (debt.saldo <= 0) {
    showToast("La deuda ya está saldada", true);
    return;
  }
  
  const paymentAbono = Math.min(abono, debt.saldo);
  const newSaldo = Math.max(0, debt.saldo - paymentAbono);
  const cuotaMensual = debt.cuotaMensual || 1;
  const newCuotas = Math.max(0, Math.ceil(newSaldo / cuotaMensual));
  
  const dateLimit = addMonthsToDate(new Date(), newCuotas);
  const newFechaFin = formatISODate(dateLimit);
  
  const updatedDebt = {
    ...debt,
    saldo: newSaldo,
    cuotasRestantes: newCuotas,
    fechaFin: newFechaFin
  };
  
  try {
    await addDoc(collection(db, "users", currentUser.uid, "transactions"), {
      tipo: "expense",
      monto: total,
      descripcion: `${debt.nombre} — ${fecha}`,
      categoria: "Deuda",
      debtId: debt.id,
      fecha,
      creadoEn: serverTimestamp()
    });
    
    await setDoc(doc(db, "users", currentUser.uid, "debts", debt.id), updatedDebt);
    showToast("Pago de TC guardado");
    await loadDebtsState(currentUser.uid);
  } catch (e) {
    console.error(e);
    showToast("Error al registrar pago de TC", true);
  }
};

function buildDebtPayModal(debt) {
  return `
  <div class="modal-bg show" id="debt-pay-modal-bg" onclick="if(event.target.id==='debt-pay-modal-bg') closeDebtPayModal()">
    <div class="modal">
      <div class="modal-handle"></div>
      <div class="modal-title">Registrar pago — ${debt.nombre}</div>
      <div class="seg" style="margin-bottom:18px;">
        <button id="pay-type-monthly" class="active" onclick="setPaymentType('monthly')">${iconHtml("calendar")}Pago del mes</button>
        <button id="pay-type-extra" onclick="setPaymentType('extra')">${iconHtml("plus")}Abono a capital</button>
      </div>
      <div class="field">
        <div class="field-label">Monto (COP)</div>
        <input type="number" inputmode="numeric" id="debt-pay-amount" value="${Math.round(debt.cuotaMensual || 0)}">
      </div>
      <div class="field">
        <div class="field-label">Fecha</div>
        <input type="date" id="debt-pay-date" value="${todayISO()}">
      </div>
      <div style="display:flex;gap:10px;margin-top:12px;">
        <button class="modal-submit" id="debt-pay-confirm" onclick="confirmDebtPayment()">${iconHtml("check")}Confirmar</button>
        <button class="modal-delete" onclick="closeDebtPayModal()">${iconHtml("x")}Cancelar</button>
      </div>
    </div>
  </div>`;
}

function buildPartialDebtPayModal(debt) {
  return `
  <div class="modal-bg show" id="debt-pay-modal-bg" onclick="if(event.target.id==='debt-pay-modal-bg') closeDebtPayModal()">
    <div class="modal" style="max-height: 90vh;">
      <div class="modal-handle"></div>
      <div class="modal-title">Registrar pago quincenal — ${debt.nombre}</div>
      
      <div class="field">
        <div class="field-label">Fecha del descuento</div>
        <input type="date" id="partial-pay-date" value="${todayISO()}">
      </div>
      
      <div class="field">
        <div class="field-label">Quincena / Tipo pago</div>
        <select id="partial-pay-quincena">
          <option value="Quincena 1">Quincena 1</option>
          <option value="Quincena 2">Quincena 2</option>
          <option value="Abono Extraordinario">Abono Extraordinario</option>
        </select>
      </div>
      
      <div class="field">
        <div class="field-label" style="margin-bottom: 8px;">Desglose de conceptos</div>
        <div id="partial-pay-concepts-container" style="margin-bottom: 8px;"></div>
        <button type="button" id="btn-add-concept" style="background: transparent; border: 1px dashed var(--line); color: var(--brand); font-weight: 600; padding: 10px; border-radius: 12px; font-size: 13px; cursor: pointer; width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 8px;">
          ${iconHtml("plus")}Agregar otro concepto
        </button>
      </div>
      
      <div class="field">
        <div class="field-label">Total descontado</div>
        <input type="number" id="partial-pay-total" readonly style="background: var(--surface); color: var(--text-2); font-weight: bold;">
      </div>
      
      <div class="field-label" style="margin-top: 15px; margin-bottom: 5px;">Resumen del pago</div>
      <div id="partial-pay-summary" style="padding: 14px; background: var(--surface); border-radius: 12px; border: 1px solid var(--line); font-size: 13px; line-height: 1.6;">
      </div>
      
      <div style="display:flex;gap:10px;margin-top:16px;">
        <button class="modal-submit" id="debt-pay-confirm" onclick="confirmPartialDebtPayment()">${iconHtml("check")}Confirmar</button>
        <button class="modal-delete" onclick="closeDebtPayModal()">${iconHtml("x")}Cancelar</button>
      </div>
    </div>
  </div>`;
}

function addConceptRow(container, name = "", amount = "", isCapital = false) {
  const row = document.createElement("div");
  row.className = "concept-row";
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "8px";
  row.style.marginBottom = "8px";
  
  row.innerHTML = `
    <input type="text" class="concept-name" value="${name}" placeholder="Concepto" style="flex: 2; min-width: 0;" ${isCapital ? 'data-is-capital="true"' : ''}>
    <input type="number" inputmode="numeric" class="concept-amount" value="${amount}" placeholder="0" style="flex: 1.5; min-width: 0;" required>
    <button type="button" class="concept-delete-btn" style="background: transparent; border: none; color: var(--red); cursor: pointer; padding: 8px; display: flex; align-items: center; justify-content: center; visibility: ${isCapital ? 'hidden' : 'visible'};" title="Eliminar">${iconHtml("trash-2")}</button>
  `;
  
  if (!isCapital) {
    row.querySelector(".concept-delete-btn").addEventListener("click", () => {
      row.remove();
      updatePartialTotal();
    });
  }
  
  row.querySelector(".concept-amount").addEventListener("input", updatePartialTotal);
  row.querySelector(".concept-name").addEventListener("input", updatePartialTotal);
  
  container.appendChild(row);
  renderIcons();
}

function initPartialDebtPayModal(debt) {
  const container = document.getElementById("partial-pay-concepts-container");
  if (!container) return;
  
  container.innerHTML = "";
  addConceptRow(container, "Abono a capital", debt.refCapital || "", true);
  addConceptRow(container, "Intereses corrientes", debt.refIntereses || "", false);
  addConceptRow(container, "Seguro vida deudor", debt.refSeguro || "", false);
  addConceptRow(container, "Otros conceptos", debt.refOtros || "", false);
  
  const dateInput = document.getElementById("partial-pay-date");
  const quincenaSelect = document.getElementById("partial-pay-quincena");
  
  const updateQuincena = () => {
    const dateVal = dateInput.value;
    if (!dateVal) return;
    const day = new Date(dateVal + "T12:00:00").getDate();
    if (quincenaSelect.value !== "Abono Extraordinario") {
      quincenaSelect.value = day <= 15 ? "Quincena 1" : "Quincena 2";
    }
  };
  
  updateQuincena();
  
  dateInput.addEventListener("change", () => {
    updateQuincena();
    updatePartialTotal();
  });
  
  quincenaSelect.addEventListener("change", () => {
    updatePartialTotal();
  });
  
  const addBtn = document.getElementById("btn-add-concept");
  if (addBtn) {
    addBtn.onclick = () => {
      addConceptRow(container, "", "", false);
    };
  }
  
  updatePartialTotal();
}

function updatePartialTotal() {
  const container = document.getElementById("partial-pay-concepts-container");
  if (!container) return;
  
  const rows = container.querySelectorAll(".concept-row");
  let total = 0;
  let capital = 0;
  
  rows.forEach(row => {
    const amtInput = row.querySelector(".concept-amount");
    const val = parseFloat(amtInput.value) || 0;
    total += val;
    
    const nameInput = row.querySelector(".concept-name");
    if (nameInput.hasAttribute("data-is-capital")) {
      capital += val;
    }
  });
  
  const totalInput = document.getElementById("partial-pay-total");
  if (totalInput) {
    totalInput.value = total;
  }
  
  const debt = debtsState.find(d => d.id === _payingDebtId);
  if (!debt) return;
  
  const nuevoSaldo = Math.max(0, debt.saldo - capital);
  const cuotaMensual = debt.cuotaMensual || 1;
  const nuevasCuotas = Math.ceil(nuevoSaldo / cuotaMensual);
  
  const dateLimit = addMonthsToDate(new Date(), nuevasCuotas);
  const nuevaFechaFin = formatISODate(dateLimit);
  
  const summaryEl = document.getElementById("partial-pay-summary");
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div style="margin-bottom: 4px; display: flex; justify-content: space-between;">
        <span style="color: var(--text-2);">Gasto registrado:</span>
        <strong style="color: var(--brand); font-family: var(--f-mono);">${fmt(total)}</strong>
      </div>
      <div style="margin-bottom: 4px; display: flex; justify-content: space-between;">
        <span style="color: var(--text-2);">Abono a capital:</span>
        <strong style="color: var(--gold); font-family: var(--f-mono);">${fmt(capital)}</strong>
      </div>
      <div style="margin-bottom: 4px; display: flex; justify-content: space-between;">
        <span style="color: var(--text-2);">Nuevo saldo estimado:</span>
        <strong style="font-family: var(--f-mono);">${fmt(nuevoSaldo)}</strong>
      </div>
      <div style="margin-bottom: 4px; display: flex; justify-content: space-between;">
        <span style="color: var(--text-2);">Cuotas restantes:</span>
        <strong style="font-family: var(--f-mono);">${nuevasCuotas} meses</strong>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--text-2);">Fecha fin estimada:</span>
        <strong style="font-family: var(--f-mono);">${nuevaFechaFin}</strong>
      </div>
    `;
  }
}

window.confirmPartialDebtPayment = async () => {
  const id = _payingDebtId;
  if (!id) return closeDebtPayModal();
  const debt = debtsState.find(d => d.id === id);
  if (!debt) return closeDebtPayModal();
  
  const fecha = document.getElementById("partial-pay-date").value || todayISO();
  const quincena = document.getElementById("partial-pay-quincena").value;
  
  const container = document.getElementById("partial-pay-concepts-container");
  if (!container) return;
  
  const rows = container.querySelectorAll(".concept-row");
  let total = 0;
  let capital = 0;
  let hasEmptyName = false;
  let hasEmptyAmount = false;
  let hasCapital = false;
  
  rows.forEach(row => {
    const nameInput = row.querySelector(".concept-name");
    const amtInput = row.querySelector(".concept-amount");
    
    const name = nameInput.value.trim();
    const amtVal = parseFloat(amtInput.value);
    
    if (!name) hasEmptyName = true;
    if (isNaN(amtVal) || amtVal < 0) hasEmptyAmount = true;
    
    total += amtVal || 0;
    
    if (nameInput.hasAttribute("data-is-capital")) {
      hasCapital = true;
      capital += amtVal || 0;
    }
  });
  
  if (!hasCapital) {
    showToast("Debe existir el concepto 'Abono a capital'", true);
    return;
  }
  if (hasEmptyName) {
    showToast("Todos los conceptos deben tener un nombre", true);
    return;
  }
  if (hasEmptyAmount) {
    showToast("Los montos no pueden estar vacíos ni ser negativos", true);
    return;
  }
  if (total <= 0) {
    showToast("El monto total debe ser mayor a 0", true);
    return;
  }
  
  closeDebtPayModal();
  
  if (!currentUser) return;
  
  if (debt.saldo <= 0) {
    showToast("La deuda ya está saldada", true);
    return;
  }
  
  const paymentCapital = Math.min(capital, debt.saldo);
  const newSaldo = Math.max(0, debt.saldo - paymentCapital);
  const cuotaMensual = debt.cuotaMensual || 1;
  const newCuotas = Math.max(0, Math.ceil(newSaldo / cuotaMensual));
  
  const dateLimit = addMonthsToDate(new Date(), newCuotas);
  const newFechaFin = formatISODate(dateLimit);
  
  const updatedDebt = {
    ...debt,
    saldo: newSaldo,
    cuotasRestantes: newCuotas,
    fechaFin: newFechaFin
  };
  
  try {
    await addDoc(collection(db, "users", currentUser.uid, "transactions"), {
      tipo: "expense",
      monto: total,
      descripcion: `${debt.nombre} — ${quincena} — ${fecha}`,
      categoria: "Deuda",
      debtId: debt.id,
      fecha,
      creadoEn: serverTimestamp()
    });
    
    await setDoc(doc(db, "users", currentUser.uid, "debts", debt.id), updatedDebt);
    showToast("Pago quincenal guardado");
    await loadDebtsState(currentUser.uid);
  } catch (e) {
    console.error(e);
    showToast("Error al registrar pago quincenal", true);
  }
};

window.setPaymentType = (type) => {
  _paymentType = type;
  document.getElementById('pay-type-monthly')?.classList.toggle('active', type === 'monthly');
  document.getElementById('pay-type-extra')?.classList.toggle('active', type === 'extra');
  const amountInput = document.getElementById('debt-pay-amount');
  if (type === 'monthly' && _payingDebtId) {
    const debt = debtsState.find(d => d.id === _payingDebtId);
    if (debt) amountInput.value = Math.round(debt.cuotaMensual || 0);
  } else if (type === 'extra') {
    amountInput.value = '';
  }
};

function openDebtPayModal(debt) {
  const existing = document.getElementById('debt-pay-modal-bg');
  if (existing) existing.remove();
  const wrapper = document.createElement('div');
  if (debt.abonoParcial) {
    wrapper.innerHTML = buildPartialDebtPayModal(debt);
  } else {
    wrapper.innerHTML = buildDebtPayModal(debt);
  }
  document.body.appendChild(wrapper.firstElementChild);
  renderIcons();
  
  if (debt.abonoParcial) {
    initPartialDebtPayModal(debt);
  } else {
    setTimeout(() => {
      const inp = document.getElementById('debt-pay-amount');
      if (inp) inp.focus();
    }, 50);
  }
}

window.closeDebtPayModal = () => {
  const el = document.getElementById('debt-pay-modal-bg');
  if (el) el.remove();
  _payingDebtId = null;
};

window.confirmDebtPayment = async () => {
  const id = _payingDebtId;
  if (!id) return closeDebtPayModal();
  const debt = debtsState.find(d => d.id === id);
  if (!debt) return closeDebtPayModal();
  const raw = document.getElementById('debt-pay-amount')?.value;
  const fecha = document.getElementById('debt-pay-date')?.value || todayISO();
  if (!raw) { showToast('Monto inválido', true); return; }
  const amount = parseFloat(String(raw).replace(/\./g, '').replace(/,/g, ''));
  if (isNaN(amount) || amount <= 0) { showToast('Monto inválido', true); return; }
  closeDebtPayModal();
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
    const txDesc = isAuto ? "Débito automático" : (_paymentType === 'monthly' ? "Pago del mes" : "Abono a capital");
    await addDoc(collection(db, "users", currentUser.uid, "transactions"), {
      tipo: "expense",
      monto: payment,
      descripcion: `${txDesc} — ${debt.nombre}`,
      categoria: "Deuda",
      debtId: debt.id,
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
      
      // Usar el array dinámico debits, con fallback a formato viejo
      let payments = debt.debits || [];
      if (!payments || payments.length === 0) {
        if (debt.debitDay1) payments.push({ day: debt.debitDay1, amount: debt.debitAmount1 || 0 });
        if (debt.debitDay2) payments.push({ day: debt.debitDay2, amount: debt.debitAmount2 || 0 });
      }
      
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
        <button class="debt-action secondary" onclick="registerDebtPayment('${d.id}')">Registrar pago o abono</button>
      </div>`;
    full.appendChild(card.cloneNode(true));
    if (preview.children.length < 2) preview.appendChild(card);
  });
  renderIcons();
}

function renderTimeline() {
  const el = document.getElementById("timeline");
  if (!el) return;

  const today = new Date(todayISO() + "T12:00:00");
  const nextIndex = HITOS_TIMELINE.findIndex(item => !item.done && new Date(item.fecha + "T12:00:00") >= today);

  el.innerHTML = HITOS_TIMELINE.map((item, index) => {
    const itemDate = new Date(item.fecha + "T12:00:00");
    const done = item.done || itemDate < today;
    const now = !done && index === nextIndex;
    const classes = ["tl-row"];
    if (done) classes.push("done");
    if (now) classes.push("now");

    return `
      <div class="${classes.join(" ")}">
        <div class="tl-rail">
          <div class="tl-node">${now ? iconHtml("star") : ""}</div>
        </div>
        <div class="tl-body">
          <div class="tl-date">${item.fecha}</div>
          <div class="tl-title">${item.label}</div>
          <div class="tl-sub">${item.detalle}</div>
          <div class="tl-gain">${iconHtml("trending-up")} ${item.monto}</div>
        </div>
      </div>`;
  }).join("");
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
  const monto = parseFloat(document.getElementById("tx-amount").value.replace(/\./g, '').replace(',', '.')) || 0;
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

// Eliminar el movimiento que se está editando (con reversión de deuda si aplica)
window.deleteTransaction = async () => {
  if (!editingTxId) return;
  if (!confirm("¿Eliminar este movimiento? No se puede deshacer.")) return;
  try {
    // Obtener la transacción antes de eliminarla para revisar si es deuda
    const txDoc = await getDoc(doc(db, "users", currentUser.uid, "transactions", editingTxId));
    const tx = txDoc.data();
    
    // Si es una transacción de categoría "Deuda" con debtId, revertir el saldo
    if (tx && tx.categoria === "Deuda" && tx.debtId) {
      const debtRef = doc(db, "users", currentUser.uid, "debts", tx.debtId);
      const debtDoc = await getDoc(debtRef);
      const debt = debtDoc.data();
      if (debt) {
        const revertedSaldo = Math.min(debt.saldoOriginal, debt.saldo + tx.monto);
        const newCuotas = Math.ceil(revertedSaldo / debt.cuotaMensual);
        await setDoc(debtRef, { ...debt, saldo: revertedSaldo, cuotasRestantes: newCuotas }, { merge: true });
      }
    }
    
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
  const monto = parseFloat(document.getElementById("sim-amount").value.replace(/\./g, '').replace(',', '.')) || 0;
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

// ============================================================
// MONEDA COLOMBIANA — FORMATO AUTOMÁTICO DE MONTOS
// ============================================================
function formatMoneyString(val) {
  if (val === null || val === undefined) return "";
  let cleanVal = String(val).replace(/[^\d,]/g, '');
  let parts = cleanVal.split(',');
  let integerPart = parts[0];
  let decimalPart = parts.length > 1 ? parts.slice(1).join('').substring(0, 2) : null;
  
  if (integerPart.length > 1) {
    integerPart = integerPart.replace(/^0+/, '');
    if (integerPart === '') integerPart = '0';
  } else if (integerPart.length === 0 && decimalPart !== null) {
    integerPart = '0';
  }
  
  let formattedInt = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimalPart !== null ? `${formattedInt},${decimalPart}` : formattedInt;
}

function getNewCursorPos(oldVal, newVal, oldCursorPos) {
  let charsBeforeCursor = 0;
  for (let i = 0; i < oldCursorPos; i++) {
    if (/[\d,]/.test(oldVal[i])) {
      charsBeforeCursor++;
    }
  }
  
  let newCursorPos = 0;
  let charsSeen = 0;
  while (newCursorPos < newVal.length && charsSeen < charsBeforeCursor) {
    if (/[\d,]/.test(newVal[newCursorPos])) {
      charsSeen++;
    }
    newCursorPos++;
  }
  return newCursorPos;
}

function isMoneyInput(input) {
  if (!input) return false;
  if (input.dataset.moneyInitialized) return false;
  
  const id = input.id;
  const className = input.className;
  
  const moneyIds = [
    "sim-amount",
    "tx-amount",
    "debt-saldo",
    "debt-refCapital",
    "debt-refIntereses-auto",
    "debt-refSeguro",
    "debt-refOtros",
    "debt-refAbono",
    "debt-refIntereses-tarjeta",
    "tarjeta-pay-abono",
    "tarjeta-pay-intereses",
    "partial-pay-total",
    "tarjeta-pay-total",
    "debt-refTotal-auto",
    "debt-refTotal-tarjeta"
  ];
  
  const moneyClasses = [
    "debit-concept-val",
    "ref-concepto-extra-value",
    "concept-amount"
  ];
  
  if (moneyIds.includes(id)) return true;
  for (let cls of moneyClasses) {
    if (className.includes(cls)) return true;
  }
  return false;
}

window.initMoneyInput = (input) => {
  if (!input) return;
  
  // Set type to text and inputmode to decimal
  input.type = "text";
  input.setAttribute("inputmode", "decimal");
  
  // Check if it's already wrapped
  if (!input.parentNode.classList.contains("money-input-wrapper")) {
    const wrapper = document.createElement("div");
    wrapper.className = "money-input-wrapper";
    
    // Transfer flex style
    if (input.style.flex) {
      wrapper.style.flex = input.style.flex;
      input.style.flex = "1";
    }
    // Transfer width style
    if (input.style.width) {
      wrapper.style.width = input.style.width;
      input.style.width = "100%";
    }
    
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
  }
  
  if (input.dataset.moneyInitialized) return;
  input.dataset.moneyInitialized = "true";
  
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  Object.defineProperty(input, 'value', {
    get: function() {
      let raw = descriptor.get.call(this);
      if (!raw) return "";
      return raw.replace(/\./g, '').replace(',', '.');
    },
    set: function(val) {
      if (val === null || val === undefined) {
        descriptor.set.call(this, "");
        return;
      }
      let formatted = formatMoneyString(String(val));
      descriptor.set.call(this, formatted);
    },
    configurable: true
  });
  
  input.addEventListener('input', () => {
    let oldVal = descriptor.get.call(input);
    let oldCursor = input.selectionStart;
    let formatted = formatMoneyString(oldVal);
    let newCursor = getNewCursorPos(oldVal, formatted, oldCursor);
    descriptor.set.call(input, formatted);
    input.setSelectionRange(newCursor, newCursor);
  });
  
  input.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    let cleanText = text.replace(/[^\d,]/g, '');
    let formatted = formatMoneyString(cleanText);
    
    let start = input.selectionStart;
    let end = input.selectionEnd;
    let currentVal = descriptor.get.call(input);
    
    let newVal = currentVal.substring(0, start) + formatted + currentVal.substring(end);
    let finalFormatted = formatMoneyString(newVal);
    
    let digitsInPasted = 0;
    for (let i = 0; i < formatted.length; i++) {
      if (/[\d,]/.test(formatted[i])) {
        digitsInPasted++;
      }
    }
    let digitsBeforePaste = 0;
    for (let i = 0; i < start; i++) {
      if (/[\d,]/.test(currentVal[i])) {
        digitsBeforePaste++;
      }
    }
    let totalDigitsBeforeCursor = digitsBeforePaste + digitsInPasted;
    
    descriptor.set.call(input, finalFormatted);
    
    let newCursorPos = 0;
    let digitsSeen = 0;
    while (newCursorPos < finalFormatted.length && digitsSeen < totalDigitsBeforeCursor) {
      if (/[\d,]/.test(finalFormatted[newCursorPos])) {
        digitsSeen++;
      }
      newCursorPos++;
    }
    
    input.setSelectionRange(newCursorPos, newCursorPos);
    input.dispatchEvent(new Event('input'));
  });
  
  input.addEventListener('focus', () => {
    setTimeout(() => {
      input.select();
    }, 50);
  });
  
  input.addEventListener('blur', () => {
    let val = descriptor.get.call(input);
    if (!val) {
      descriptor.set.call(input, "0");
    } else {
      if (val.endsWith(',')) {
        val = val.substring(0, val.length - 1);
      }
      descriptor.set.call(input, formatMoneyString(val));
    }
    input.dispatchEvent(new Event('input'));
  });
  
  let initial = descriptor.get.call(input);
  if (initial) {
    descriptor.set.call(input, formatMoneyString(initial));
  }
};

// Inicialización de inputs existentes en carga de script
document.querySelectorAll('input').forEach(input => {
  if (isMoneyInput(input)) {
    initMoneyInput(input);
  }
});

// Observador para inicializar dinámicamente inputs futuros (modales, cuotas, etc.)
const moneyObserver = new MutationObserver((mutations) => {
  mutations.forEach(mutation => {
    mutation.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'INPUT' && isMoneyInput(node)) {
          initMoneyInput(node);
        } else {
          const inputs = node.querySelectorAll ? node.querySelectorAll('input') : [];
          inputs.forEach(input => {
            if (isMoneyInput(input)) {
              initMoneyInput(input);
            }
          });
        }
      }
    });
  });
});
moneyObserver.observe(document.body, { childList: true, subtree: true });

// ============================================================
// MENÚ ACCIONES FLOTANTE (FAB)
// ============================================================
window.toggleFabMenu = () => {
  const btn = document.getElementById("fab-main-btn");
  const menu = document.getElementById("fab-menu");
  if (!btn || !menu) return;
  
  const isOpen = menu.classList.toggle("show");
  btn.classList.toggle("active", isOpen);
};

// Cerrar menú al hacer clic afuera
document.addEventListener("click", (e) => {
  const container = document.getElementById("fab-container");
  const menu = document.getElementById("fab-menu");
  const btn = document.getElementById("fab-main-btn");
  if (container && menu && btn) {
    if (!container.contains(e.target) && menu.classList.contains("show")) {
      menu.classList.remove("show");
      btn.classList.remove("active");
    }
  }
});

