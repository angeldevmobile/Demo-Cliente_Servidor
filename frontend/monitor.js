// Monitor: procesos, cola, carrera y búsqueda. Página pública, sin sesión.

const $ = (id) => document.getElementById(id);
const NUM = new Intl.NumberFormat("es-ES");
const INTERVALO = 2000;
const HISTORIAL = 30;

function escapar(t) {
  return String(t ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function aviso(texto) {
  $("aviso").textContent = texto || "";
  $("aviso").className = "aviso error";
  $("aviso").hidden = !texto;
}

const mb = (b) => b ? `${NUM.format(Math.round(b / 1048576))} MB` : "—";

function ms(x) {
  if (x == null) return "—";
  if (x < 1) return `${x.toFixed(2).replace(".", ",")} ms`;
  if (x < 1000) return `${NUM.format(Math.round(x))} ms`;
  return `${(x / 1000).toFixed(2).replace(".", ",")} s`;
}

function duracion(s) {
  if (s < 60) return `${Math.round(s)} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${Math.floor(s % 3600 / 60)} min`;
  return `${Math.floor(s / 86400)} d`;
}

// La instancia sale de la cabecera que pone Orion en cada respuesta JSON.
async function pedir(ruta, opciones) {
  const t0 = performance.now();
  const r = await fetch(ruta, opciones);
  const datos = await r.json().catch(() => ({}));
  return { r, datos, instancia: r.headers.get("X-Orion-Instancia") || "?", ms: performance.now() - t0 };
}

//   Procesos y cola, cada 2 s

const atendidas = [];

function pintarProcesos(lista, quien) {
  if (!lista.length) {
    $("procesos").innerHTML = `<p class="tenue">Aún no hay procesos registrados.</p>`;
    return;
  }
  $("procesos").innerHTML = lista.map((p) => {
    // Las web se refrescan cuando las atiende esta página; los workers, cada 5 s.
    const vivo = p.sin_senal_s < (p.tipo === "web" ? 30 : 15);
    const marca = p.nombre === quien ? `<span class="te-atendio">te acaba de atender</span>` : "";
    return `
      <article class="proceso ${vivo ? "" : "callado"} ${p.nombre === quien ? "activo" : ""}">
        <header>
          <span class="punto ${vivo ? "vivo" : ""}"></span>
          <b>${escapar(p.nombre)}</b>
          <span class="etiqueta-mini">${p.tipo === "web" ? "web" : "worker"}</span>
          ${marca}
        </header>
        <dl>
          <dt>Orion</dt><dd>v${escapar(p.version)}</dd>
          <dt>PID</dt><dd>${p.pid}</dd>
          <dt>RAM</dt><dd>${mb(p.rss)} <span class="tenue">(pico ${mb(p.pico)})</span></dd>
          <dt>Arrancó</dt><dd>hace ${duracion(p.vivo_s)}</dd>
          <dt>Señal</dt><dd>${vivo ? `hace ${duracion(p.sin_senal_s)}` : `sin señal hace ${duracion(p.sin_senal_s)}`}</dd>
        </dl>
      </article>`;
  }).join("");
}

function pintarReparto() {
  const cuenta = {};
  for (const i of atendidas) cuenta[i] = (cuenta[i] || 0) + 1;
  $("reparto-n").textContent = atendidas.length;
  $("reparto").innerHTML = Object.keys(cuenta).sort().map((i) => `
    <div class="reparto-fila">
      <span>${escapar(i)}</span>
      <div class="reparto-pista"><div style="width:${(cuenta[i] / atendidas.length) * 100}%"></div></div>
      <b>${cuenta[i]}</b>
    </div>`).join("");
}

const ESTADOS = ["pendiente", "procesando", "hecho", "fallido"];

function pintarCola(d) {
  $("cola-cuentas").innerHTML = ESTADOS.map((e) =>
    `<span class="chip"><span class="estado estado-${e}">${e}</span> ${NUM.format(d.cola[e] || 0)}</span>`).join("");

  $("por-worker").innerHTML = !d.por_worker.length
    ? `<span class="tenue">Ningún trabajo hecho en las últimas 24 h.</span>`
    : d.por_worker.map((w) =>
    `<span class="chip"><b>${escapar(w.worker)}</b> ${NUM.format(w.hechos)} hechos · ${ms(w.ms_medio)} de media</span>`).join("");

  $("trabajos").innerHTML = d.trabajos.length ? d.trabajos.map((t) => `
    <tr>
      <td class="tenue">#${t.id}</td>
      <td>${escapar(t.tipo)}</td>
      <td><span class="estado estado-${escapar(t.estado)}" title="${escapar(t.error || "")}">${escapar(t.estado)}</span>
          ${t.intentos > 1 ? `<span class="tenue">· intento ${t.intentos}</span>` : ""}</td>
      <td>${escapar(t.tomado_por || "—")}</td>
      <td class="num">${ms(t.espera_ms)}</td>
      <td class="num">${ms(t.duracion_ms)}</td>
      <td class="num tenue">${duracion(t.hace_s)}</td>
    </tr>`).join("")
    : `<tr><td colspan="7" class="vacio-tabla">La cola está vacía. Lanza la carrera: la compra ganadora encola su factura.</td></tr>`;
}

async function refrescar() {
  if (document.hidden) return;
  try {
    const { r, datos, instancia } = await pedir("/api/monitor");
    if (!r.ok) throw new Error(datos.error || `error ${r.status}`);
    atendidas.push(instancia);
    if (atendidas.length > HISTORIAL) atendidas.shift();
    pintarProcesos(datos.procesos, datos.atendido_por);
    pintarReparto();
    pintarCola(datos);
    aviso("");
  } catch (e) {
    aviso("No se pudo consultar el estado: " + e.message);
  }
}

//   La carrera

$("lanzar").addEventListener("click", async () => {
  const boton = $("lanzar");
  boton.disabled = true;
  try {
    const prep = await pedir("/api/monitor/carrera", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ compradores: Number($("compradores").value) }),
    });
    if (!prep.r.ok) throw new Error(prep.datos.error || `error ${prep.r.status}`);

    // Todas las compras en el mismo instante: ninguna espera a la anterior.
    const compras = await Promise.all(prep.datos.compradores.map((c) =>
      pedir("/api/checkout", { method: "POST", headers: { Authorization: "Bearer " + c.token } })
        .then((x) => ({ ...x, nombre: c.nombre }))));

    const fin = await pedir("/api/monitor/carrera");
    pintarCarrera(compras, fin.datos);
    refrescar();
  } catch (e) {
    aviso("La carrera no pudo lanzarse: " + e.message);
  } finally {
    boton.disabled = false;
  }
});

function pintarCarrera(compras, fin) {
  const ganan = compras.filter((c) => c.r.status === 201).length;
  const pierden = compras.filter((c) => c.r.status === 409).length;
  const instancias = new Set(compras.map((c) => c.instancia)).size;
  $("carrera-resumen").innerHTML = [
    ["Compras confirmadas", ganan, ganan === 1 ? "exactamente una" : "debería ser una"],
    ["Rechazadas", pierden, "con 409, sin cobrar nada"],
    ["Stock final", fin.stock, "nunca por debajo de 0"],
    ["Instancias", instancias, "atendieron la carrera"],
  ].map(([t, v, s]) => `<div class="kpi"><span class="kpi-titulo">${t}</span><b>${v}</b><span class="tenue">${s}</span></div>`).join("");

  $("carrera-filas").innerHTML = compras
    .sort((a, b) => a.ms - b.ms)
    .map((c) => {
      const gano = c.r.status === 201;
      const texto = gano ? `compró · pedido #${c.datos.id}` : escapar(c.datos.error || `error ${c.r.status}`);
      return `<tr class="${gano ? "ganador" : ""}">
        <td>${escapar(c.nombre)}</td>
        <td>${escapar(c.instancia)}</td>
        <td><span class="estado ${gano ? "estado-listo" : "estado-cancelado"}">${gano ? "201" : c.r.status}</span> ${texto}</td>
        <td class="num">${ms(c.ms)}</td>
      </tr>`;
    }).join("");
  $("carrera").hidden = false;
}

//   La búsqueda

$("form-busqueda").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const boton = ev.submitter;
  if (boton) boton.disabled = true;
  try {
    const { r, datos } = await pedir("/api/monitor/busqueda?q=" + encodeURIComponent($("termino").value));
    if (!r.ok) throw new Error(datos.error || `error ${r.status}`);
    pintarBusqueda(datos);
  } catch (e) {
    aviso("No se pudo medir: " + e.message);
  } finally {
    if (boton) boton.disabled = false;
  }
});

function pintarBusqueda(d) {
  const lento = Math.max(d.texto_completo.ms, d.ilike.ms) || 1;
  const columna = (titulo, x, clase) => `
    <div class="medida ${clase}">
      <span class="kpi-titulo">${titulo}</span>
      <b>${ms(x.ms)}</b>
      <div class="medida-pista"><div style="width:${Math.max(2, (x.ms / lento) * 100)}%"></div></div>
      <ul>${x.plan.map((n) => `<li><code>${escapar(n)}</code></li>`).join("")}</ul>
    </div>`;
  $("busqueda").innerHTML = `
    <p class="tenue">«${escapar(d.termino)}»: ${NUM.format(d.coinciden)} de ${NUM.format(d.productos)} productos coinciden.</p>
    <div class="medidas">
      ${columna("Texto completo (la tienda)", d.texto_completo, "rapida")}
      ${columna("ILIKE '%…%'", d.ilike, "")}
    </div>
    ${d.productos < 10000 ? `<p class="tenue">Con un catálogo tan pequeño las dos van rápido. Con un millón de
      productos la diferencia es de 0,08 ms frente a 651 ms (medido en el README).</p>` : ""}`;
  $("busqueda").hidden = false;
}

refrescar();
setInterval(refrescar, INTERVALO);
document.addEventListener("visibilitychange", refrescar);
