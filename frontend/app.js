// Tienda: habla con el backend de Orion por su API pública.

// Lo construido. Mientras una fase sea false, sus controles no se muestran.
const FASES = { cuentas: true, carrito: true, panel: true };

const $ = (id) => document.getElementById(id);
const EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

let categoriaActual = "";
let busquedaActual = "";

const ARTE = {
  teclados: {
    fondo: ["#eaf3ee", "#d7e9df"], oscuro: ["#141a18", "#19231f"], trazo: "#3f9c72",
    dibujo: `<rect x="8" y="26" width="84" height="48" rx="7"/>
             <path d="M20 40h12M38 40h12M56 40h12M74 40h6M20 52h8M34 52h12M52 52h12M70 52h10M28 64h44"/>`,
  },
  monitores: {
    fondo: ["#ebeff7", "#d8e1f0"], oscuro: ["#141820", "#1a2129"], trazo: "#5b8fd6",
    dibujo: `<rect x="10" y="20" width="80" height="50" rx="5"/>
             <path d="M42 70v10M58 70v10M34 80h32"/>`,
  },
  audio: {
    fondo: ["#f4eee8", "#e7dbcd"], oscuro: ["#1d1915", "#26201a"], trazo: "#c08a4e",
    dibujo: `<path d="M22 56V44a28 28 0 0 1 56 0v12"/>
             <rect x="12" y="52" width="16" height="26" rx="7"/>
             <rect x="72" y="52" width="16" height="26" rx="7"/>`,
  },
  accesorios: {
    fondo: ["#f0ecf7", "#e0d8f0"], oscuro: ["#1a1820", "#221e2b"], trazo: "#9a86cf",
    dibujo: `<rect x="16" y="30" width="68" height="40" rx="6"/>
             <path d="M30 44h40M30 56h24"/><circle cx="72" cy="56" r="5"/>`,
  },
};

function lienzo(categoria) {
  const a = ARTE[categoria] || ARTE.accesorios;
  const oscuro = matchMedia("(prefers-color-scheme: dark)").matches;
  const [c1, c2] = oscuro ? a.oscuro : a.fondo;
  const id = "g" + Math.random().toString(36).slice(2, 8);
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" class="fondo"
               style="position:absolute;inset:0;width:100%;height:100%">
            <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
            </linearGradient></defs>
            <rect width="100" height="100" fill="url(#${id})"/>
          </svg>
          <svg viewBox="0 0 100 100" style="position:relative" fill="none"
               stroke="${a.trazo}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
            ${a.dibujo}
          </svg>`;
}

function aviso(texto, tono) {
  const el = $("aviso");
  if (!texto) { el.hidden = true; return; }
  el.textContent = texto;
  el.className = "aviso " + (tono || "");
  el.hidden = false;
}

// El token vive en localStorage y viaja en la cabecera Authorization. No se
// guarda en una cookie para que ninguna petición lo mande sin querer.
const sesion = {
  get token() { try { return localStorage.getItem("token"); } catch { return null } },
  get usuario() {
    try { return JSON.parse(localStorage.getItem("usuario") || "null"); } catch { return null }
  },
  entrar(token, usuario) {
    try {
      localStorage.setItem("token", token);
      localStorage.setItem("usuario", JSON.stringify(usuario));
    } catch {}
    pintarSesion();
  },
  salir() {
    try { localStorage.removeItem("token"); localStorage.removeItem("usuario"); } catch {}
    pintarSesion();
  },
};

async function api(ruta, opciones) {
  const op = { ...(opciones || {}) };
  op.headers = { ...(op.headers || {}) };
  if (sesion.token) op.headers.Authorization = "Bearer " + sesion.token;

  const r = await fetch(ruta, op);
  const datos = await r.json().catch(() => ({}));
  // 401 con token guardado significa que caducó: se limpia y se pide entrar.
  if (r.status === 401 && sesion.token) {
    sesion.salir();
    throw new Error("tu sesión ha caducado, vuelve a entrar");
  }
  if (!r.ok) throw Object.assign(new Error(datos.error || `error ${r.status}`), { datos });
  return datos;
}

function pintarSesion() {
  const u = sesion.usuario;
  const dentro = Boolean(u && sesion.token);
  $("quien").textContent = dentro ? u.nombre : "";
  $("quien").hidden = !dentro;
  $("entrar").hidden = dentro;
  $("salir").hidden = !dentro;
  if (FASES.panel) $("ir-panel").hidden = !(dentro && u.rol === "admin");
  if (FASES.carrito) $("ver-carrito").hidden = !dentro;
}

let modoRegistro = false;

function ponerModo(registro) {
  modoRegistro = registro;
  $("titulo-acceso").textContent = registro ? "Crear cuenta" : "Entrar";
  $("campo-nombre").hidden = !registro;
  $("nombre").required = registro;
  $("enviar-acceso").textContent = registro ? "Crear cuenta" : "Entrar";
  $("texto-cambio").textContent = registro ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?";
  $("cambiar-modo").textContent = registro ? "Entrar" : "Crear una";
  $("pass").autocomplete = registro ? "new-password" : "current-password";
  $("error-acceso").hidden = true;
}

function abrirAcceso() {
  ponerModo(false);
  $("panel-acceso").hidden = false;
  $("velo").hidden = false;
  $("email").focus();
}

$("cambiar-modo").addEventListener("click", () => ponerModo(!modoRegistro));
$("entrar").addEventListener("click", abrirAcceso);
$("salir").addEventListener("click", () => {
  sesion.salir();
  cargarCarrito();
  aviso("Has salido de tu cuenta.", "ok");
});

$("form-acceso").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const boton = $("enviar-acceso");
  const err = $("error-acceso");
  err.hidden = true;
  boton.disabled = true;

  const cuerpo = {
    email: $("email").value.trim(),
    pass: $("pass").value,
  };
  if (modoRegistro) cuerpo.nombre = $("nombre").value.trim();

  try {
    const datos = await api(modoRegistro ? "/api/registro" : "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    sesion.entrar(datos.token, datos.usuario);
    cerrar();
    await Promise.all([cargarCarrito(), cargarCatalogo()]);
    $("pass").value = "";
    aviso(`Hola, ${datos.usuario.nombre}.`, "ok");
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
  } finally {
    boton.disabled = false;
  }
});

function escapar(t) {
  return String(t).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function tarjeta(p) {
  const art = document.createElement("article");
  art.className = "producto" + (p.stock === 0 ? " agotado" : "");

  let etiqueta = "";
  if (p.stock === 0) etiqueta = `<span class="etiqueta agotado">agotado</span>`;
  else if (p.stock <= 5) etiqueta = `<span class="etiqueta pocas">quedan ${p.stock}</span>`;

  const boton = FASES.carrito && p.stock > 0
    ? `<button class="btn-principal" data-id="${p.id}">Añadir</button>` : "";

  art.innerHTML = `
    <div class="lienzo">${lienzo(p.categoria)}${etiqueta}</div>
    <div class="cuerpo">
      <span class="sku">${escapar(p.sku)}</span>
      <h3>${escapar(p.nombre)}</h3>
      <p class="desc">${escapar(p.descripcion)}</p>
      <div class="pie-producto">
        <b class="precio">${EUR.format(p.precio)}</b>
        ${boton}
      </div>
    </div>`;

  const b = art.querySelector("button");
  if (b) b.addEventListener("click", () => anadirAlCarrito(p.id));
  return art;
}

async function cargarCatalogo() {
  const params = new URLSearchParams();
  if (busquedaActual) params.set("q", busquedaActual);
  if (categoriaActual) params.set("cat", categoriaActual);

  const productos = await api("/api/productos?" + params);
  const rejilla = $("rejilla");
  rejilla.replaceChildren();

  $("contador").textContent = productos.length
    ? `${productos.length} producto${productos.length === 1 ? "" : "s"}` : "";

  if (!productos.length) {
    const vacio = document.createElement("p");
    vacio.className = "vacio";
    vacio.textContent = busquedaActual
      ? `Nada que coincida con «${busquedaActual}».`
      : "No hay productos en esta categoría.";
    rejilla.appendChild(vacio);
    return;
  }
  for (const p of productos) rejilla.appendChild(tarjeta(p));
}

async function cargarCategorias() {
  const cats = await api("/api/categorias");
  const nav = $("categorias");
  nav.replaceChildren();

  for (const c of [{ nombre: "", etiqueta: "todo" }, ...cats]) {
    const b = document.createElement("button");
    b.className = "categoria" + (c.nombre === categoriaActual ? " activa" : "");
    b.textContent = c.etiqueta || `${c.nombre} (${c.productos})`;
    b.addEventListener("click", () => {
      categoriaActual = c.nombre;
      cargarCategorias();
      cargarCatalogo().catch((e) => aviso(e.message, "error"));
    });
    nav.appendChild(b);
  }
}

// La búsqueda espera a que dejes de teclear: una consulta por tecla sobra.
let temporizador = null;
$("q").addEventListener("input", (ev) => {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    busquedaActual = ev.target.value.trim();
    cargarCatalogo().catch((e) => aviso(e.message, "error"));
  }, 250);
});
$("buscador").addEventListener("submit", (ev) => ev.preventDefault());

//   Carrito
async function cargarCarrito() {
  if (!sesion.token) { pintarCarrito({ unidades: 0, total: 0, lineas: [] }); return; }
  try {
    pintarCarrito(await api("/api/carrito"));
  } catch (e) {
    pintarCarrito({ unidades: 0, total: 0, lineas: [] });
  }
}

function pintarCarrito(c) {
  const burbuja = $("cuenta-carrito");
  burbuja.textContent = c.unidades;
  burbuja.hidden = !c.unidades;
  $("total").textContent = EUR.format(c.total || 0);
  $("pagar").disabled = !c.lineas.length;

  const cont = $("lineas");
  cont.replaceChildren();

  if (!c.lineas.length) {
    const v = document.createElement("p");
    v.className = "vacio";
    v.textContent = "Tu carrito está vacío.";
    cont.appendChild(v);
    return;
  }

  for (const l of c.lineas) {
    const sinStock = agotadas.has(l.id);
    const fila = document.createElement("div");
    fila.className = "linea" + (sinStock ? " agotada" : "");
    fila.innerHTML = `
      <div>
        <span class="sku">${escapar(l.sku)}</span>
        <p class="nombre">${escapar(l.nombre)}</p>
        <span class="detalle">${sinStock
          ? `quedan ${l.stock}: quítalo o compra menos`
          : `${l.cantidad} × ${EUR.format(l.precio)}`}</span>
      </div>
      <b>${EUR.format(l.subtotal)}</b>
      <button class="quitar" title="Quitar">×</button>`;
    fila.querySelector(".quitar").addEventListener("click", () => quitarLinea(l.id));
    cont.appendChild(fila);
  }
}

async function anadirAlCarrito(productoId) {
  if (!sesion.token) { abrirAcceso(); return; }
  try {
    pintarCarrito(await api("/api/carrito", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ producto_id: productoId, cantidad: 1 }),
    }));
    aviso("Añadido al carrito.", "ok");
  } catch (e) {
    aviso(e.message, "error");
  }
}

// Líneas que la última compra rechazó por falta de stock, para marcarlas.
let agotadas = new Set();

async function quitarLinea(id) {
  agotadas.delete(id);
  try {
    pintarCarrito(await api(`/api/carrito/${id}`, { method: "DELETE" }));
  } catch (e) {
    aviso(e.message, "error");
  }
}

$("ver-carrito").addEventListener("click", async () => {
  await cargarCarrito();
  $("panel-carrito").hidden = false;
  $("velo").hidden = false;
});

$("pagar").addEventListener("click", async () => {
  const boton = $("pagar");
  boton.disabled = true;
  boton.textContent = "Comprando…";
  try {
    const pedido = await api("/api/checkout", { method: "POST" });
    agotadas = new Set();
    cerrar();
    aviso(`Pedido #${pedido.id} confirmado: ${EUR.format(pedido.total)}.`, "ok");
    await Promise.all([cargarCarrito(), cargarCatalogo()]);
  } catch (e) {
    // 409: el carrito era válido, pero alguien se adelantó con el stock.
    agotadas = new Set(e.datos?.agotadas || []);
    aviso(e.message, "error");
    await Promise.all([cargarCarrito(), cargarCatalogo()]);
  } finally {
    boton.textContent = "Comprar";
  }
});

function cerrar() {
  for (const p of document.querySelectorAll(".panel")) p.hidden = true;
  $("velo").hidden = true;
}
for (const b of document.querySelectorAll(".cerrar")) b.addEventListener("click", cerrar);
$("velo").addEventListener("click", cerrar);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(); });

if (FASES.cuentas) pintarSesion();
if (FASES.carrito && sesion.token) cargarCarrito();

Promise.all([cargarCategorias(), cargarCatalogo()]).catch((e) =>
  aviso("No se pudo cargar el catálogo: " + e.message, "error")
);
