#!/usr/bin/env bash
#
# Seis compradores, una sola unidad. O se vende una, o ninguna. Nunca dos.
#
#   bash pruebas/compra-simultanea.sh [url]
#
# Deja el producto de prueba con stock 1, mete una unidad en seis carritos y
# lanza los seis checkouts a la vez. Comprueba que se creo exactamente un
# pedido, que se vendio exactamente una unidad y que el stock quedo en cero.
set -euo pipefail

BASE="${1:-http://127.0.0.1:8083}"
SKU="ACC-04"
CLAVE="clave-larga-123"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

json() { python -c "import json,sys; print(json.load(sys.stdin)$1)"; }
sql()  { docker exec comercio-db psql -U comercio -d comercio -tAc "$1" | tr -d '[:space:]'; }

echo "Tienda: $BASE"

# El stock se deja en 1: la prueba parte de un estado conocido, no de lo que
# haya quedado de la vez anterior.
sql "UPDATE productos SET stock = 1 WHERE sku = '$SKU'" >/dev/null
echo "Stock de $SKU puesto a 1"

PRODUCTO=$(curl -s "$BASE/api/productos/$SKU" | json "['id']")

# Marca de agua: los pedidos anteriores a esta pasada no cuentan.
ANTES=$(sql "SELECT COALESCE(MAX(id),0) FROM pedidos")

for i in $(seq 1 6); do
  curl -s -X POST "$BASE/api/registro" -H "Content-Type: application/json" \
       -d "{\"email\":\"c$i@ej.com\",\"pass\":\"$CLAVE\",\"nombre\":\"Comprador $i\"}" >/dev/null || true
  curl -s -X POST "$BASE/api/login" -H "Content-Type: application/json" \
       -d "{\"email\":\"c$i@ej.com\",\"pass\":\"$CLAVE\"}" | json "['token']" > "$TMP/t$i"

  curl -s -o /dev/null -X POST "$BASE/api/carrito" \
       -H "Content-Type: application/json" -H "Authorization: Bearer $(cat "$TMP/t$i")" \
       -d "{\"producto_id\":$PRODUCTO,\"cantidad\":1}"
done
echo "Seis carritos con una unidad cada uno"

echo
echo "Seis checkouts a la vez:"
for i in $(seq 1 6); do
  ( curl -s -o "$TMP/o$i" -w "%{http_code}" -X POST "$BASE/api/checkout" \
         -H "Authorization: Bearer $(cat "$TMP/t$i")" > "$TMP/c$i" ) &
done
wait

exitos=0
for i in $(seq 1 6); do
  codigo=$(cat "$TMP/c$i")
  [ "$codigo" = "201" ] && exitos=$((exitos + 1))
  echo "  comprador $i: HTTP $codigo"
done

vendidas=$(sql "SELECT COALESCE(SUM(i.cantidad),0) FROM pedido_items i
                JOIN productos p ON p.id = i.producto_id
                WHERE p.sku = '$SKU' AND i.pedido_id > $ANTES")
stock=$(sql "SELECT stock FROM productos WHERE sku = '$SKU'")

echo
echo "Resultado:"
echo "  compras aceptadas: $exitos   (debe ser 1)"
echo "  unidades vendidas: $vendidas   (debe ser 1)"
echo "  stock final:       $stock   (debe ser 0, nunca negativo)"

if [ "$exitos" = "1" ] && [ "$vendidas" = "1" ] && [ "$stock" = "0" ]; then
  echo
  echo "OK: una sola venta, sin stock negativo."
else
  echo
  echo "FALLO: la transaccion no protegio el stock."
  exit 1
fi
