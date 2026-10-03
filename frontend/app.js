// Tienda: frontend que consume la API del backend en Orion.

// Funciones activas; con false, sus controles no se muestran.
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

// El JWT se guarda en localStorage y se envía en la cabecera Authorization,
// no en una cookie, para que no viaje en peticiones que no lo necesitan.
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
  // 401 con token guardado: el token caducó, se borra la sesión.
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
  $("ir-pedidos").hidden = !dentro;
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
  if (location.hash.startsWith("#/pedido")) location.hash = "#/";
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
    mostrarRuta();
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
  return String(t ?? "").replace(/[&<>"]/g, (c) =>
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
      <h3><a href="${rutaFicha(p.sku)}">${escapar(p.nombre)}</a></h3>
      <p class="desc">${escapar(p.descripcion)}</p>
      <div class="pie-producto">
        <b class="precio">${EUR.format(p.precio)}</b>
        ${boton}
      </div>
    </div>`;

  const b = art.querySelector("button");
  if (b) b.addEventListener("click", (ev) => { ev.stopPropagation(); anadirAlCarrito(p.id, 1); });
  art.addEventListener("click", (ev) => {
    if (!ev.target.closest("a")) location.hash = rutaFicha(p.sku);
  });
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

// Debounce: busca 250 ms después de la última tecla.
let temporizador = null;
$("q").addEventListener("input", (ev) => {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    busquedaActual = ev.target.value.trim();
    if (rutaActual().vista !== "catalogo") location.hash = "#/";
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
        <div class="cantidad mini">
          <button data-d="-1" aria-label="Uno menos" ${l.cantidad <= 1 ? "disabled" : ""}>−</button>
          <span>${l.cantidad}</span>
          <button data-d="1" aria-label="Uno más" ${l.cantidad >= l.stock ? "disabled" : ""}>+</button>
        </div>
      </div>
      <b>${EUR.format(l.subtotal)}</b>
      <button class="quitar" title="Quitar">×</button>`;
    fila.querySelector(".quitar").addEventListener("click", () => quitarLinea(l.id));
    for (const b of fila.querySelectorAll(".cantidad button")) {
      b.addEventListener("click", () => cambiarCantidad(l.id, l.cantidad + Number(b.dataset.d)));
    }
    cont.appendChild(fila);
  }
}

async function anadirAlCarrito(productoId, cantidad) {
  if (!sesion.token) { abrirAcceso(); return; }
  try {
    pintarCarrito(await api("/api/carrito", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ producto_id: productoId, cantidad }),
    }));
    aviso(cantidad > 1 ? `${cantidad} unidades añadidas al carrito.` : "Añadido al carrito.", "ok");
  } catch (e) {
    aviso(e.message, "error");
  }
}

// Líneas rechazadas por falta de stock en la última compra, para marcarlas.
let agotadas = new Set();

async function cambiarCantidad(id, cantidad) {
  agotadas.delete(id);
  try {
    pintarCarrito(await api(`/api/carrito/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cantidad }),
    }));
  } catch (e) {
    aviso(e.message, "error");
  }
}

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
    aviso("");
    boton.textContent = "Yendo a pagar…";
    await Promise.all([cargarCarrito(), cargarCatalogo()]);
    await irAPagar(pedido.id);
  } catch (e) {
    // 409: el carrito era válido, pero otro comprador se llevó el stock.
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

//   Vistas: catálogo, ficha, mis pedidos y confirmación. La ruta va en el hash (#/p/SKU)
//   para que funcionen el botón atrás y los enlaces.

function rutaFicha(sku) { return "#/p/" + encodeURIComponent(sku); }

function rutaActual() {
  const [, tipo, id] = location.hash.replace(/^#/, "").split("/");
  if (tipo === "p" && id) return { vista: "ficha", id: decodeURIComponent(id) };
  if (tipo === "pedidos") return { vista: "pedidos" };
  if (tipo === "pedido" && id) return { vista: "confirmacion", id: Number(id) };
  return { vista: "catalogo" };
}

function mostrarVista(vista) {
  const catalogo = vista === "catalogo";
  $("portada").hidden = !catalogo;
  $("vista-catalogo").hidden = !catalogo;
  $("rejilla").hidden = !catalogo;
  $("vista-ficha").hidden = vista !== "ficha";
  $("vista-pedidos").hidden = vista !== "pedidos";
  $("vista-confirmacion").hidden = vista !== "confirmacion";
}

async function mostrarRuta() {
  const r = rutaActual();
  mostrarVista(r.vista);
  if (r.vista !== "catalogo") window.scrollTo(0, 0);
  try {
    if (r.vista === "ficha") await pintarFicha(r.id);
    if (r.vista === "pedidos") await pintarPedidos();
    if (r.vista === "confirmacion") await pintarConfirmacion(r.id);
  } catch (e) {
    aviso(e.message, "error");
  }
}

const FECHA = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" });

function textoStock(stock) {
  if (stock === 0) return `<p class="ficha-stock agotado">Agotado</p>`;
  if (stock <= 5) return `<p class="ficha-stock pocas">Últimas ${stock} unidades</p>`;
  return `<p class="ficha-stock">En stock · ${stock} unidades</p>`;
}

async function pintarFicha(sku) {
  const v = $("vista-ficha");
  v.innerHTML = `<div class="esqueleto ficha-esqueleto"></div>`;
  let p;
  try {
    p = await api("/api/productos/" + encodeURIComponent(sku));
  } catch {
    v.innerHTML = `<p class="vacio">Ese producto no existe o ya no está a la venta.
      <a class="enlace" href="#/">Volver a la tienda</a></p>`;
    return;
  }
  const compra = FASES.carrito && p.stock > 0 ? `
    <div class="ficha-compra">
      <div class="cantidad">
        <button data-d="-1" aria-label="Uno menos">−</button>
        <input id="ficha-cantidad" type="number" min="1" max="${p.stock}" value="1" aria-label="Cantidad">
        <button data-d="1" aria-label="Uno más">+</button>
      </div>
      <button id="ficha-anadir" class="btn-principal">Añadir al carrito</button>
    </div>` : "";

  v.innerHTML = `
    <nav class="migas">
      <a href="#/">Tienda</a><span>/</span>
      <a href="#/" data-cat="${escapar(p.categoria)}">${escapar(p.categoria)}</a><span>/</span>
      <span>${escapar(p.nombre)}</span>
    </nav>
    <div class="ficha">
      <div class="lienzo ficha-lienzo">${lienzo(p.categoria)}</div>
      <div class="ficha-info">
        <span class="sku">${escapar(p.sku)}</span>
        <h1>${escapar(p.nombre)}</h1>
        <p class="ficha-desc">${escapar(p.descripcion)}</p>
        <b class="ficha-precio">${EUR.format(p.precio)}</b>
        ${textoStock(p.stock)}
        ${compra}
        ${p.detalle ? `<p class="ficha-detalle">${escapar(p.detalle)}</p>` : ""}
        ${p.caracteristicas.length ? `
          <h2>Características</h2>
          <ul class="caracteristicas">${p.caracteristicas.map((c) => `<li>${escapar(c)}</li>`).join("")}</ul>` : ""}
      </div>
    </div>
    ${p.relacionados.length ? `
      <section class="relacionados">
        <h2>Más en ${escapar(p.categoria)}</h2>
        <div class="rejilla"></div>
      </section>` : ""}`;

  v.querySelector("[data-cat]").addEventListener("click", () => {
    categoriaActual = p.categoria;
    cargarCategorias();
    cargarCatalogo().catch((e) => aviso(e.message, "error"));
  });
  const rel = v.querySelector(".relacionados .rejilla");
  if (rel) for (const r of p.relacionados) rel.appendChild(tarjeta(r));

  const campo = $("ficha-cantidad");
  if (!campo) return;
  const fijar = (n) => { campo.value = Math.min(p.stock, Math.max(1, n || 1)); };
  for (const b of v.querySelectorAll(".ficha-compra .cantidad button")) {
    b.addEventListener("click", () => fijar(Number(campo.value) + Number(b.dataset.d)));
  }
  campo.addEventListener("change", () => fijar(Number(campo.value)));
  $("ficha-anadir").addEventListener("click", () => anadirAlCarrito(p.id, Number(campo.value)));
}

function tablaLineas(items) {
  return `
    <div class="tabla-envoltorio">
      <table class="tabla">
        <thead><tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Precio</th><th class="num">Subtotal</th></tr></thead>
        <tbody>${items.map((i) => `
          <tr>
            <td><a class="enlace-tabla" href="${rutaFicha(i.sku)}">${escapar(i.nombre)}</a>
                <span class="sku">${escapar(i.sku)}</span></td>
            <td class="num">${i.cantidad}</td>
            <td class="num">${EUR.format(i.precio_unitario)}</td>
            <td class="num">${EUR.format(i.subtotal)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

const NOMBRE_ESTADO = {
  pendiente_pago: "pendiente de pago", pagado: "pagado", enviado: "enviado",
  entregado: "entregado", cancelado: "cancelado", caducado: "caducado",
};
const PAGADO = new Set(["pagado", "enviado", "entregado"]);
const HORA = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" });

const etiquetaEstado = (e) =>
  `<span class="estado estado-${escapar(e)}">${escapar(NOMBRE_ESTADO[e] || e)}</span>`;

// Crea (o reutiliza) el cargo y redirige a la pasarela. Si falla, muestra el pedido con el botón Pagar.
async function irAPagar(id) {
  try {
    const r = await api(`/api/pedidos/${id}/pagar`, { method: "POST" });
    location.href = r.url_pago;
  } catch (e) {
    location.hash = `#/pedido/${id}`;
    aviso(e.message, "error");
  }
}

// Texto de estado del pedido: plazo para pagar, factura o motivo del rechazo.
function notaPedido(p) {
  if (p.estado === "pendiente_pago") {
    const motivo = p.pago_motivo ? `Último intento: ${escapar(p.pago_motivo)}. ` : "";
    return `${motivo}Las unidades están reservadas hasta las ${HORA.format(new Date(p.expira))}.`;
  }
  if (p.estado === "caducado") return "No se pagó a tiempo: las unidades volvieron a la tienda.";
  if (p.pago_motivo) return escapar(p.pago_motivo);
  if (!PAGADO.has(p.estado)) return "";
  if (!p.factura) return "La factura se está generando en segundo plano.";
  return `Factura <b>${escapar(p.factura)}</b> · <button class="enlace" data-factura="${p.id}"
    data-nombre="${escapar(p.factura)}.pdf">Descargar PDF</button>${p.factura_enviada ? " · enviada a tu correo" : ""}`;
}

// Pedidos que aún pueden cambiar: pago pendiente, factura o correo por enviar.
const enMovimiento = (p) => p.estado === "pendiente_pago" || (PAGADO.has(p.estado) && !p.factura_enviada);

function botonPagar(p) {
  return p.estado === "pendiente_pago"
    ? `<button class="btn-principal" data-pagar="${p.id}">Pagar ${EUR.format(p.total)}</button>` : "";
}

// La descarga necesita el JWT en la cabecera: se pide con fetch y se guarda como archivo.
async function descargarFactura(id, nombre) {
  try {
    const r = await fetch(`/api/pedidos/${id}/factura`, { headers: { Authorization: "Bearer " + sesion.token } });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `error ${r.status}`);
    const url = URL.createObjectURL(await r.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    aviso("No se pudo descargar la factura: " + e.message, "error");
  }
}

function conectarPagar(v) {
  for (const b of v.querySelectorAll("[data-pagar]")) {
    b.addEventListener("click", () => { b.disabled = true; irAPagar(Number(b.dataset.pagar)); });
  }
  for (const b of v.querySelectorAll("[data-factura]")) {
    b.addEventListener("click", () => descargarFactura(b.dataset.factura, b.dataset.nombre));
  }
}

let refresco = null;

function refrescarLuego(pintar, intento) {
  clearTimeout(refresco);
  if (intento >= 30) return;
  const vista = rutaActual().vista;
  refresco = setTimeout(() => {
    if (rutaActual().vista === vista) pintar(intento + 1).catch(() => {});
  }, 2000);
}

async function pintarPedidos(intento = 0) {
  clearTimeout(refresco);
  const v = $("vista-pedidos");
  if (!sesion.token) {
    v.innerHTML = `<p class="vacio">Entra en tu cuenta para ver tus pedidos.</p>`;
    abrirAcceso();
    return;
  }
  const pedidos = await api("/api/pedidos");
  v.innerHTML = `<h1 class="titulo-vista">Mis pedidos</h1>` + (pedidos.length
    ? pedidos.map((p) => `
      <article class="pedido">
        <header>
          <b>Pedido #${p.id}</b>
          <span class="tenue">${FECHA.format(new Date(p.creado))}</span>
          ${etiquetaEstado(p.estado)}
          <b class="pedido-total">${EUR.format(p.total)}</b>
        </header>
        ${tablaLineas(p.items)}
        <div class="pedido-pie">
          <p class="tenue">${notaPedido(p)}</p>
          ${botonPagar(p)}
        </div>
      </article>`).join("")
    : `<p class="vacio">Aún no has comprado nada. <a class="enlace" href="#/">Ir a la tienda</a></p>`);
  conectarPagar(v);
  if (pedidos.some(enMovimiento)) refrescarLuego(pintarPedidos, intento);
}

// Al volver de la pasarela, el aviso de pago puede tardar un momento:
// mientras siga pendiente, se vuelve a consultar.
async function pintarConfirmacion(id, intento = 0) {
  clearTimeout(refresco);
  const v = $("vista-confirmacion");
  const p = sesion.token ? (await api("/api/pedidos")).find((x) => x.id === id) : null;
  if (!p) {
    v.innerHTML = `<p class="vacio">No encuentro ese pedido. <a class="enlace" href="#/pedidos">Ver mis pedidos</a></p>`;
    return;
  }
  const pagado = PAGADO.has(p.estado);
  const titulo = pagado ? "Pago recibido"
    : p.estado === "pendiente_pago" ? "Falta pagar tu pedido"
    : p.estado === "caducado" ? "El plazo para pagar terminó" : `Pedido ${NOMBRE_ESTADO[p.estado] || p.estado}`;
  v.innerHTML = `
    <div class="confirmacion">
      <div class="confirmacion-marca ${pagado ? "" : "pendiente"}" aria-hidden="true">${pagado ? "✓" : "…"}</div>
      <h1>${titulo}</h1>
      <p>Pedido <b>#${p.id}</b> por <b>${EUR.format(p.total)}</b> ${etiquetaEstado(p.estado)}</p>
      <p>${notaPedido(p)}</p>
      ${tablaLineas(p.items)}
      <div class="acciones confirmacion-acciones">
        ${botonPagar(p)}
        <a class="${p.estado === "pendiente_pago" ? "btn-plano" : "btn-principal"}" href="#/">Seguir comprando</a>
        <a class="btn-plano" href="#/pedidos">Ver mis pedidos</a>
      </div>
    </div>`;
  conectarPagar(v);
  if (enMovimiento(p)) refrescarLuego((n) => pintarConfirmacion(id, n), intento);
}

window.addEventListener("hashchange", mostrarRuta);
mostrarRuta();
