#!/usr/bin/env bash
#
# Treinta trabajos, tres workers a la vez. Cada trabajo se procesa una vez.
#
#   bash pruebas/cola-paralela.sh [n_trabajos]
#
# Si la reclamacion no fuera atomica, dos workers se llevarian el mismo
# trabajo: se veria en los intentos (mayores que 1) o en trabajos sin terminar.
set -euo pipefail

N="${1:-30}"
ORION="${ORION:-orion}"
export ORION_BD="${ORION_BD:-postgres://comercio:comercio@127.0.0.1:5433/comercio}"

sql() { docker exec comercio-db psql -U comercio -d comercio -tAc "$1" | tr -d '[:space:]'; }

# Hace falta un pedido del que hacer factura; se usa el mas reciente.
PEDIDO=$(sql "SELECT COALESCE(MAX(id),0) FROM pedidos")
if [ "$PEDIDO" = "0" ]; then
  echo "No hay ningun pedido todavia: compra algo antes de lanzar esta prueba."
  exit 1
fi

docker exec comercio-db psql -U comercio -d comercio -qc "
DELETE FROM trabajos;
INSERT INTO trabajos (tipo, datos)
SELECT 'factura', '{\"pedido_id\": $PEDIDO}' FROM generate_series(1, $N);" >/dev/null

echo "Encolados $N trabajos (factura del pedido $PEDIDO)"
echo
echo "Tres workers a la vez:"

for w in w1 w2 w3; do
  ( ORION_TOPE=100000 ORION_WORKER="$w" "$ORION" --run backend/worker.orx >/dev/null 2>&1 ) &
done
wait

echo
echo "Reparto:"
docker exec comercio-db psql -U comercio -d comercio -tAc \
  "SELECT '  ' || tomado_por || ': ' || COUNT(*) FROM trabajos GROUP BY tomado_por ORDER BY tomado_por"

hechos=$(sql "SELECT COUNT(*) FROM trabajos WHERE estado = 'hecho'")
repetidos=$(sql "SELECT COUNT(*) FROM trabajos WHERE intentos > 1")

echo
echo "Resultado:"
echo "  trabajos hechos:          $hechos   (debe ser $N)"
echo "  procesados mas de una vez: $repetidos   (debe ser 0)"

if [ "$hechos" = "$N" ] && [ "$repetidos" = "0" ]; then
  echo
  echo "OK: cada trabajo, exactamente una vez."
else
  echo
  echo "FALLO: la reclamacion no fue atomica."
  exit 1
fi
