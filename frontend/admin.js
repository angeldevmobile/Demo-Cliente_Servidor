// Panel de administración: habla con /api/admin/*. La sesión es la misma de
// la tienda (localStorage), así que un admin que ya entró no repite el login.

const $ = (id) => document.getElementById(id);
const EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const NUM = new Intl.NumberFormat("es-ES");

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
  },
  salir() {
    try { localStorage.removeItem("token"); localStorage.removeItem("usuario"); } catch {}
  },
};

const esAdmin = () => Boolean(sesion.token && sesion.usuario && sesion.usuario.rol === "admin");

function escapar(t) {
  return String(t ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function aviso(texto, tono) {
  const el = $("aviso");
  if (!texto) { el.hidden = true; return; }
  el.textContent = texto;
  el.className = "aviso " + (tono || "");
  el.hidden = false;
}

async function peticion(ruta, opciones) {
  const op = { ...(opciones || {}) };
  op.headers = { ...(op.headers || {}) };
  if (sesion.token) op.headers.Authorization = "Bearer " + sesion.token;
  const r = await fetch(ruta, op);
  if (r.status === 401 || r.status === 403) {
    sesion.salir();
    mostrarAcceso(r.status === 403 ? "Esta cuenta no es de administración." : "Tu sesión ha caducado.");
    throw new Error("sin acceso");
  }
  return r;
}

async function api(ruta, opciones) {
  const r = await peticion(ruta, opciones);
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error || `error ${r.status}`);
  return datos;
}

const json = (metodo, cuerpo) => ({
  method: metodo,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(cuerpo),
});

//   Acceso y pestañas

function mostrarAcceso(mensaje) {
  for (const t of document.querySelectorAll(".tab")) t.hidden = true;
  $("pestanas").hidden = true;
  $("salir").hidden = true;
  $("quien").hidden = true;
  $("acceso").hidden = false;
  const err = $("error-acceso");
  err.textContent = mensaje || "";
  err.hidden = !mensaje;
}

function entrarAlPanel() {
  $("acceso").hidden = true;
  $("pestanas").hidden = false;
  $("salir").hidden = false;
  $("quien").textContent = sesion.usuario.nombre;
  $("quien").hidden = false;
  abrir("resumen");
}

$("form-acceso").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  try {
    const r = await fetch("/api/login", json("POST", { email: $("email").value.trim(), pass: $("pass").value }));
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(datos.error || "no se pudo entrar");
    if (datos.usuario.rol !== "admin") throw new Error("Esta cuenta no es de administración.");
    sesion.entrar(datos.token, datos.usuario);
    $("pass").value = "";
    entrarAlPanel();
  } catch (e) {
    mostrarAcceso(e.message);
  }
});

$("salir").addEventListener("click", () => { sesion.salir(); mostrarAcceso(); });

const CARGAR = {
  resumen: cargarResumen,
  productos: cargarProductos,
  pedidos: cargarPedidos,
  informes: cargarInformes,
  importar: async () => {},
};

function abrir(tab) {
  aviso("");
  for (const b of document.querySelectorAll(".pestana")) b.classList.toggle("activa", b.dataset.tab === tab);
  for (const t of document.querySelectorAll(".tab")) t.hidden = t.id !== "tab-" + tab;
  CARGAR[tab]().catch((e) => { if (e.message !== "sin acceso") aviso(e.message, "error"); });
}

for (const b of document.querySelectorAll(".pestana")) {
  b.addEventListener("click", () => abrir(b.dataset.tab));
}

//   Resumen

async function cargarResumen() {
  const r = await api("/api/admin/resumen");
  const tarjetas = [
    ["Ventas hoy", EUR.format(r.ventas_hoy), `${r.pedidos_hoy} pedidos`],
    ["Ventas del mes", EUR.format(r.ventas_mes), ""],
    ["Por enviar", NUM.format(r.por_enviar), "pedidos pagados"],
    ["Agotados", NUM.format(r.agotados), `${r.pocas_unidades} con 5 o menos`],
    ["Trabajos en cola", NUM.format(r.trabajos_en_cola), "facturas e informes"],
  ];
  $("kpis").innerHTML = tarjetas.map(([t, v, d]) => `
    <div class="kpi"><span class="kpi-titulo">${t}</span><b>${v}</b><span class="tenue">${d}</span></div>`).join("");
}

//   Productos

let productos = [];

async function cargarProductos() {
  const q = $("q-admin").value.trim();
  productos = await api("/api/admin/productos?" + new URLSearchParams(q ? { q } : {}));
  const cuerpo = $("filas-productos");
  if (!productos.length) {
    cuerpo.innerHTML = `<tr><td colspan="7" class="vacio-tabla">Ningún producto${q ? ` coincide con «${escapar(q)}»` : ""}.</td></tr>`;
    return;
  }
  cuerpo.innerHTML = productos.map((p) => `
    <tr class="${p.activo ? "" : "inactivo"}">
      <td class="sku">${escapar(p.sku)}</td>
      <td>${escapar(p.nombre)}${p.activo ? "" : ' <span class="etiqueta-mini">retirado</span>'}</td>
      <td>${escapar(p.categoria)}</td>
      <td class="num">${EUR.format(p.precio)}</td>
      <td class="num ${p.stock === 0 ? "rojo" : ""}">${NUM.format(p.stock)}</td>
      <td><span class="ajuste">
        <input type="number" step="1" value="1" data-delta="${p.id}" aria-label="Unidades">
        <button class="btn-mini" data-sumar="${p.id}">+</button>
        <button class="btn-mini" data-restar="${p.id}">−</button>
      </span></td>
      <td class="acciones-fila">
        <button class="enlace" data-editar="${p.id}">Editar</button>
        <button class="enlace" data-activo="${p.id}">${p.activo ? "Retirar" : "Reactivar"}</button>
      </td>
    </tr>`).join("");
}

let temporizador = null;
$("q-admin").addEventListener("input", () => {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => cargarProductos().catch((e) => aviso(e.message, "error")), 250);
});

$("filas-productos").addEventListener("click", async (ev) => {
  const b = ev.target.closest("button");
  if (!b) return;
  try {
    if (b.dataset.sumar || b.dataset.restar) {
      const id = b.dataset.sumar || b.dataset.restar;
      const n = parseInt(document.querySelector(`[data-delta="${id}"]`).value, 10) || 0;
      const delta = b.dataset.sumar ? n : -n;
      const r = await api(`/api/admin/productos/${id}/stock`, json("POST", { delta }));
      aviso(`Stock ajustado en ${delta > 0 ? "+" : ""}${delta}: ahora ${r.stock}.`, "ok");
    } else if (b.dataset.editar) {
      editar(productos.find((p) => String(p.id) === b.dataset.editar));
      return;
    } else if (b.dataset.activo) {
      const p = productos.find((x) => String(x.id) === b.dataset.activo);
      await api(`/api/admin/productos/${p.id}`, json("PUT", { activo: !p.activo }));
      aviso(p.activo ? `«${p.nombre}» retirado de la tienda.` : `«${p.nombre}» vuelve a la tienda.`, "ok");
    }
    await cargarProductos();
  } catch (e) {
    if (e.message !== "sin acceso") aviso(e.message, "error");
  }
});

function editar(p) {
  const nuevo = !p;
  $("form-producto").hidden = false;
  $("p-id").value = nuevo ? "" : p.id;
  $("p-sku").value = nuevo ? "" : p.sku;
  $("p-sku").disabled = !nuevo;
  $("p-nombre").value = nuevo ? "" : p.nombre;
  $("p-categoria").value = nuevo ? "" : p.categoria;
  $("p-precio").value = nuevo ? "" : p.precio;
  $("p-descripcion").value = nuevo ? "" : p.descripcion;
  // El stock solo se fija al dar de alta; después se ajusta con + y −.
  $("campo-stock").hidden = !nuevo;
  $("p-stock").value = 0;
  (nuevo ? $("p-sku") : $("p-nombre")).focus();
}

$("nuevo").addEventListener("click", () => editar(null));
$("cancelar-producto").addEventListener("click", () => { $("form-producto").hidden = true; });

$("form-producto").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const id = $("p-id").value;
  const datos = {
    nombre: $("p-nombre").value,
    categoria: $("p-categoria").value,
    precio: parseFloat($("p-precio").value),
    descripcion: $("p-descripcion").value,
  };
  try {
    if (id) {
      await api(`/api/admin/productos/${id}`, json("PUT", datos));
      aviso("Producto actualizado.", "ok");
    } else {
      datos.sku = $("p-sku").value;
      datos.stock = parseInt($("p-stock").value, 10) || 0;
      const p = await api("/api/admin/productos", json("POST", datos));
      aviso(`Alta de ${p.sku}: «${p.nombre}».`, "ok");
    }
    $("form-producto").hidden = true;
    await cargarProductos();
  } catch (e) {
    if (e.message !== "sin acceso") aviso(e.message, "error");
  }
});

//   Pedidos

const SIGUIENTE = {
  pagado: [["enviado", "Marcar enviado"], ["cancelado", "Cancelar"]],
  enviado: [["entregado", "Marcar entregado"]],
};

async function cargarPedidos() {
  const estado = $("filtro-estado").value;
  const pedidos = await api("/api/admin/pedidos?" + new URLSearchParams(estado ? { estado } : {}));
  const cuerpo = $("filas-pedidos");
  if (!pedidos.length) {
    cuerpo.innerHTML = `<tr><td colspan="8" class="vacio-tabla">No hay pedidos${estado ? " en ese estado" : ""}.</td></tr>`;
    return;
  }
  cuerpo.innerHTML = pedidos.map((p) => `
    <tr>
      <td class="sku">#${p.id}</td>
      <td>${escapar(p.creado)}</td>
      <td>${escapar(p.cliente)}<br><span class="tenue">${escapar(p.email)}</span></td>
      <td class="num">${NUM.format(p.unidades)}</td>
      <td class="num">${EUR.format(p.total)}</td>
      <td><span class="estado estado-${p.estado}">${p.estado}</span></td>
      <td>${p.factura ? escapar(p.factura) : '<span class="tenue">en cola</span>'}</td>
      <td class="acciones-fila">${(SIGUIENTE[p.estado] || []).map(([e, t]) =>
        `<button class="enlace ${e === "cancelado" ? "rojo" : ""}" data-pedido="${p.id}" data-estado="${e}">${t}</button>`).join("")}</td>
    </tr>`).join("");
}

$("filtro-estado").addEventListener("change", () => cargarPedidos().catch((e) => aviso(e.message, "error")));

$("filas-pedidos").addEventListener("click", async (ev) => {
  const b = ev.target.closest("button[data-pedido]");
  if (!b) return;
  if (b.dataset.estado === "cancelado" && !confirm(`¿Cancelar el pedido #${b.dataset.pedido}? Las unidades vuelven al stock.`)) return;
  try {
    await api(`/api/admin/pedidos/${b.dataset.pedido}`, json("PUT", { estado: b.dataset.estado }));
    aviso(`Pedido #${b.dataset.pedido}: ${b.dataset.estado}.`, "ok");
    await cargarPedidos();
  } catch (e) {
    if (e.message !== "sin acceso") aviso(e.message, "error");
  }
});

//   Informes

const hoy = new Date();
// Fecha local, no UTC: por la tarde, toISOString() ya daría el día siguiente.
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
$("i-desde").value = iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
$("i-hasta").value = iso(hoy);

let sondeo = null;

async function cargarInformes() {
  const lista = await api("/api/admin/informes");
  const cuerpo = $("filas-informes");
  cuerpo.innerHTML = lista.length ? lista.map((i) => `
    <tr>
      <td class="sku">#${i.id}</td>
      <td>${escapar(i.desde)} → ${escapar(i.hasta)}</td>
      <td>${i.formato === "xlsx" ? "Excel" : "PDF"}</td>
      <td><span class="estado estado-${i.estado}">${i.estado}</span>${i.error ? `<br><span class="tenue">${escapar(i.error)}</span>` : ""}</td>
      <td class="num">${i.bytes ? NUM.format(Math.round(i.bytes / 1024)) + " KB" : ""}</td>
      <td class="num">${i.segundos != null ? i.segundos + " s" : ""}</td>
      <td>${i.estado === "listo" ? `<button class="enlace" data-informe="${i.id}">Descargar</button>` : ""}</td>
    </tr>`).join("")
    : `<tr><td colspan="7" class="vacio-tabla">Todavía no has pedido ningún informe.</td></tr>`;

  // Mientras haya alguno en marcha, se vuelve a mirar cada 2 segundos.
  clearTimeout(sondeo);
  if (lista.some((i) => i.estado === "pendiente") && !$("tab-informes").hidden) {
    sondeo = setTimeout(() => cargarInformes().catch(() => {}), 2000);
  }
}

$("form-informe").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  try {
    const r = await api("/api/admin/informes", json("POST", {
      formato: $("i-formato").value, desde: $("i-desde").value, hasta: $("i-hasta").value,
    }));
    aviso(`Informe #${r.id} en cola.`, "ok");
    await cargarInformes();
  } catch (e) {
    if (e.message !== "sin acceso") aviso(e.message, "error");
  }
});

// La descarga lleva el token en la cabecera, así que no vale un <a href>: se
// pide con fetch y se guarda como archivo.
$("filas-informes").addEventListener("click", async (ev) => {
  const b = ev.target.closest("button[data-informe]");
  if (!b) return;
  try {
    const r = await peticion(`/api/admin/informes/${b.dataset.informe}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `error ${r.status}`);
    const nombre = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") || "")?.[1] || "informe";
    const url = URL.createObjectURL(await r.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    if (e.message !== "sin acceso") aviso(e.message, "error");
  }
});

//   Importar

$("form-importar").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const boton = $("subir");
  const datos = new FormData();
  datos.append("csv", $("archivo").files[0]);
  boton.disabled = true;
  boton.textContent = "Importando…";
  try {
    const r = await api("/api/admin/importar", { method: "POST", body: datos });
    const res = $("resultado-importar");
    res.innerHTML = [
      ["Filas leídas", NUM.format(r.filas)],
      ["Nuevos", NUM.format(r.nuevos)],
      ["Actualizados", NUM.format(r.actualizados)],
      ["Tiempo total", r.segundos.toFixed(2) + " s"],
    ].map(([t, v]) => `<div class="kpi"><span class="kpi-titulo">${t}</span><b>${v}</b></div>`).join("");
    res.hidden = false;
    aviso("Catálogo importado.", "ok");
  } catch (e) {
    if (e.message !== "sin acceso") aviso(e.message, "error");
  } finally {
    boton.disabled = false;
    boton.textContent = "Importar";
  }
});

//   Arranque

if (esAdmin()) entrarAlPanel();
else mostrarAcceso();
