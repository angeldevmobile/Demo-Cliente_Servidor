#!/usr/bin/env bash
# Genera un catálogo, lo importa midiendo tiempo y RAM, y compara ILIKE con texto completo.
# Uso: bash pruebas/carga-masiva.sh [filas | limpiar]  (la RAM se mide con Python + psutil)
set -euo pipefail

ORION="${ORION:-orion}"
export ORION_BD="${ORION_BD:-postgres://comercio:comercio@127.0.0.1:5433/comercio}"
sql() { docker exec comercio-db psql -U comercio -d comercio -tAc "$1"; }

if [ "${1:-}" = "limpiar" ]; then
  # Los productos ya vendidos o en un carrito no se pueden borrar: se desactivan.
  sql "UPDATE productos SET activo = false WHERE sku LIKE 'GEN-%'
       AND (id IN (SELECT producto_id FROM pedido_items) OR id IN (SELECT producto_id FROM lineas))" >/dev/null
  borrados=$(sql "WITH b AS (DELETE FROM productos WHERE sku LIKE 'GEN-%' AND activo RETURNING 1) SELECT COUNT(*) FROM b")
  sql "VACUUM ANALYZE productos" >/dev/null
  echo "Productos generados borrados: $borrados"
  exit 0
fi

N="${1:-1000000}"
CSV="${TMPDIR:-/tmp}/catalogo-$N.csv"

if [ ! -f "$CSV" ]; then
  echo "== Generando $N filas"
  "$ORION" run herramientas/generar-catalogo.orx "$N" "$CSV"
  echo
fi

# En Git Bash, Python necesita la ruta del binario en formato Windows.
ORION_RUTA="$(command -v "$ORION")"
command -v cygpath >/dev/null && ORION_RUTA="$(cygpath -w "$ORION_RUTA")"

echo "== Importando, con el pico de RAM del proceso"
python - "$ORION_RUTA" "$CSV" <<'EOF'
import subprocess, sys, time
try:
    import psutil
except ImportError:
    psutil = None
p = subprocess.Popen([sys.argv[1], "run", "herramientas/importar.orx", sys.argv[2]])
pico = 0
proc = psutil.Process(p.pid) if psutil else None
while p.poll() is None:
    if proc:
        try:
            m = proc.memory_info()
            pico = max(pico, getattr(m, "peak_wset", 0) or m.rss)
        except psutil.Error:
            pass
    time.sleep(0.02)
print()
print(f"  pico de RAM de Orion: {pico / 1048576:.0f} MB" if proc else "  pico de RAM: sin medir (falta psutil)")
sys.exit(p.returncode)
EOF
echo

echo "== Búsqueda"
"$ORION" run herramientas/medir-busqueda.orx
