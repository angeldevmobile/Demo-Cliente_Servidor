# Comercio

Una tienda con catálogo, cuentas de usuario, carrito y compra real, escrita
entera en Orion sobre **PostgreSQL**.

Las otras demos de esta carpeta responden a "¿esto funciona?". Esta responde a
la pregunta que viene después: **"¿aguanta un proyecto de verdad?"**. Backend
repartido en varios archivos, autenticación con contraseñas, dinero, stock, y
una operación que no puede salir a medias.

> **Estado: las siete fases terminadas.** Catálogo, cuentas con JWT, compra
> transaccional, panel de administración con informes en Excel y PDF, carga
> masiva de un millón de productos, despliegue con balanceador y tres
> instancias, y cola de trabajos en Postgres con workers aparte.
>
> **Necesita Orion 0.1.6 o posterior.** Construirla destapó varios fallos del
> lenguaje (`and`/`or` sin cortocircuito, `attempt` que no capturaba dentro de
> `serve`, errores de Postgres sin mensaje…), que se corrigieron en Orion y no
> con rodeos aquí. Ver el CHANGELOG de Orion.

## Lo que tiene que demostrar

Una tienda es un buen banco de pruebas porque tiene un problema que no admite
atajos: **dos personas comprando la última unidad a la vez**. O se vende una, o
ninguna. Nunca dos. Eso no se resuelve con velocidad, se resuelve con
transacciones, y es lo que separa un backend de un juguete.

| Qué | Cómo se demuestra |
|---|---|
| Un backend se puede partir en módulos | 13 archivos `.orx` que se importan entre sí |
| Las contraseñas se guardan bien | `argon2`, nunca la contraseña en claro |
| Las sesiones son reales | JWT firmado, rutas protegidas con `router.guard` |
| El dinero no se pierde | Checkout dentro de una transacción, con `ROLLBACK` si falla |
| El stock no se vende dos veces | Bloqueo de fila en Postgres, probado con compradores simultáneos |
| Los informes salen del mismo lenguaje | Excel y PDF generados por Orion, sin librerías externas |
| Los datos entran rápido | Catálogo de un millón de filas por `COPY`, con la RAM medida |

## Estructura

```
comercio/
├── backend/
│   ├── main.orx         arranque, rutas y middlewares
│   ├── config.orx       entorno: puerto, URL de la base, secreto JWT, admin
│   ├── http.orx         leer la petición y montar la respuesta
│   ├── bd.orx           esquema, índices y siembra (catálogo y administrador)
│   ├── cuentas.orx      registro, login, hash de contraseñas, JWT
│   ├── catalogo.orx     productos y búsqueda de texto completo
│   ├── carrito.orx      carrito del usuario
│   ├── pedidos.orx      checkout transaccional e historial
│   ├── cola.orx         cola de trabajos en Postgres
│   ├── worker.orx       proceso aparte que consume la cola
│   ├── admin.orx        productos, stock, pedidos y petición de informes
│   ├── informes.orx     informes de ventas en Excel y PDF
│   └── importar.orx     carga masiva del catálogo por COPY
├── frontend/
│   ├── index.html       tienda y carrito
│   ├── admin.html       panel de administración
│   ├── app.js
│   ├── admin.js
│   └── estilos.css
├── herramientas/
│   ├── generar-catalogo.orx   catálogo de prueba del tamaño que se pida
│   ├── importar.orx           importación desde la línea de órdenes
│   └── medir-busqueda.orx     ILIKE frente a texto completo
├── pruebas/
│   ├── compra-simultanea.sh   seis compradores, una unidad
│   ├── cola-paralela.sh       tres workers, ningún trabajo dos veces
│   └── carga-masiva.sh        un millón de productos, tiempo y RAM
├── datos/
│   └── catalogo.csv     catálogo de siembra
├── despliegue/nginx.conf
├── docker-compose.yml   Postgres, tres instancias, dos workers y nginx
└── Dockerfile
```

Cada archivo del backend se importa con `use "backend/pedidos" as pedidos` y
expone sus funciones. Es la primera demo de esta carpeta que no cabe en un
archivo, y esa es justamente la intención.

## Modelo de datos

```
usuarios     id, email, hash_pass, nombre, rol, creado
productos    id, sku, nombre, descripcion, categoria, precio, stock, activo
carritos     id, usuario_id, creado
lineas       id, carrito_id, producto_id, cantidad, precio_unitario
pedidos      id, usuario_id, total, estado, creado
pedido_items id, pedido_id, producto_id, cantidad, precio_unitario
trabajos     id, tipo, datos, estado, intentos, ejecutar_en, tomado_por, …
facturas     id, pedido_id, numero, contenido, creada
informes     id, formato, desde, hasta, estado, contenido (BYTEA), bytes, …
```

El precio se guarda **también en la línea del pedido**. Un pedido de ayer no
puede cambiar de importe porque hoy se haya subido el precio del producto: lo
que se cobró es un hecho, no una consulta.

`precio` va en `NUMERIC`, nunca en coma flotante. Orion lo convierte a Float al
leerlo, pero las sumas de dinero las hace Postgres.

## API

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/api/registro` | Crea una cuenta |
| `POST` | `/api/login` | Devuelve el JWT |
| `GET` | `/api/productos` | Catálogo, con búsqueda y filtros |
| `GET` | `/api/productos/:sku` | Ficha de un producto |
| `GET` | `/api/carrito` | Carrito del usuario |
| `POST` | `/api/carrito` | Añade una línea |
| `DELETE` | `/api/carrito/:id` | Quita una línea |
| `POST` | `/api/checkout` | **Compra: la operación que importa** |
| `GET` | `/api/pedidos` | Historial del usuario |
| `GET` | `/api/admin/resumen` | Ventas de hoy y del mes, pedidos por enviar, agotados, cola |
| `GET` | `/api/admin/productos` | Productos, también los retirados |
| `POST` | `/api/admin/productos` | Alta de producto |
| `PUT` | `/api/admin/productos/:id` | Edición (nombre, precio, categoría, retirar) |
| `POST` | `/api/admin/productos/:id/stock` | Ajusta el stock en `delta` unidades |
| `GET` | `/api/admin/pedidos` | Pedidos, filtrables por estado |
| `PUT` | `/api/admin/pedidos/:id` | Enviado, entregado o cancelado (repone el stock) |
| `POST` | `/api/admin/informes` | Pide un informe (Excel o PDF): se encola |
| `GET` | `/api/admin/informes` | Informes pedidos y su estado |
| `GET` | `/api/admin/informes/:id` | Descarga un informe listo |
| `POST` | `/api/admin/importar` | Carga masiva desde un CSV (hasta 50 MB) |

Todo lo que cuelga de `/api/carrito`, `/api/checkout`, `/api/pedidos` y
`/api/admin` va detrás de `router.guard`: sin un JWT válido, `serve` responde
401 y el handler ni se ejecuta. `/api/admin` pasa además por un middleware que
exige el rol `admin` en el token (403 si no).

## El checkout, que es el corazón

Cuatro sentencias en **una** transacción, y el orden importa: el descuento de
stock va primero porque es lo único que puede fallar.

```sql
BEGIN
  UPDATE productos p SET stock = p.stock - l.cantidad     -- puede fallar aquí
    FROM lineas l WHERE l.producto_id = p.id AND l.carrito_id = ?
  INSERT INTO pedidos (usuario_id, total) SELECT ?, SUM(p.precio * l.cantidad) ...
  INSERT INTO pedido_items ... SELECT currval('pedidos_id_seq'), ...
  DELETE FROM lineas WHERE carrito_id = ?
COMMIT
```

**La guarda es el `CHECK (stock >= 0)` del esquema.** Si a algún producto no le
alcanzan las unidades, el `UPDATE` viola la restricción, Postgres aborta y
revierte la transacción entera: no queda ni pedido, ni líneas, ni stock tocado.

No hace falta `SELECT ... FOR UPDATE`: el propio `UPDATE` bloquea las filas que
toca, así que dos compras simultáneas del mismo producto se ponen en fila y la
segunda ve el stock ya descontado.

Que la restricción haga de guarda no es un rodeo, es lo correcto: la regla vive
en la base, así que la cumple **cualquiera** que escriba en esa tabla, incluido
un `psql` a mano o el panel de administración.

Si la compra falla por falta de stock (SQLSTATE 23514), una consulta aparte
busca qué líneas no alcanzan, **solo para el mensaje**: la respuesta dice el
producto y cuántas unidades quedan, y la página marca esas líneas en el carrito.
Quien decide sigue siendo la transacción.

### Comprobado, no prometido

```bash
bash pruebas/compra-simultanea.sh
```

Pone el stock de la lámpara en 1, la mete en seis carritos y lanza los seis
checkouts a la vez:

```
comprador 1: HTTP 201
comprador 2: HTTP 409
comprador 3: HTTP 409
comprador 4: HTTP 409
comprador 5: HTTP 409
comprador 6: HTTP 409

compras aceptadas: 1   (debe ser 1)
unidades vendidas: 1   (debe ser 1)
stock final:       0   (debe ser 0, nunca negativo)
```

Si la transacción estuviera mal, saldrían varias ventas y el stock en negativo.
El script falla con código de salida 1 si eso ocurre, así que sirve de prueba
de regresión.

## Por qué Postgres y no SQLite

Las otras demos usan SQLite y les sobra. Aquí hace falta lo que SQLite no da:

- **Bloqueo por fila** (`FOR UPDATE`). SQLite bloquea la base entera.
- **`NUMERIC` de verdad** para dinero, sin coma flotante.
- **`COPY FROM STDIN`**, que es lo que permite cargar un millón de filas en
  segundos.
- **Un pool de conexiones** que aproveche los hilos del servidor.

## Fases

1. ✅ **Base**: esquema, conexión, catálogo, búsqueda, filtros y frontend.
2. ✅ **Cuentas**: registro, login con argon2id, JWT y rutas protegidas.
3. ✅ **Carrito y checkout**: la transacción, y el script que la pone a prueba
   con compradores simultáneos.
4. ✅ **Panel de administración**: productos, stock, pedidos e informes en
   Excel y PDF generados por un worker.
5. ✅ **Carga masiva**: un millón de productos por `COPY`, con el tiempo, la
   RAM y la búsqueda medidos.
6. ✅ **Despliegue**: `docker compose up` levanta Postgres, **tres instancias**
   web, **dos workers** y un nginx que reparte.
7. ✅ **Cola de trabajos**: tabla en Postgres con reclamación atómica, workers
   como procesos aparte, y la factura encolada dentro de la transacción de la
   compra.

Mientras una fase no esté, sus controles no aparecen en la página: es
preferible a enseñar botones que devuelven 404. El interruptor está arriba de
`frontend/app.js`.

## El panel de administración

`/admin.html`, solo para cuentas con rol `admin`. Registrarse siempre da rol
`cliente`: el administrador se siembra al arrancar con `ORION_ADMIN_EMAIL` y
`ORION_ADMIN_PASS` (por defecto `admin@comercio.test` / `admin-de-juguete`). Si
alguien se registró antes con ese email, no se le asciende.

Lo que hace:

- **Resumen**: ventas de hoy y del mes, pedidos por enviar, agotados y
  trabajos en cola.
- **Productos**: alta, edición, retirar y reactivar. El **stock se ajusta**
  (+5, −2) y no se fija: fijarlo a 10 viendo un 8 se comería las ventas hechas
  desde que se cargó la página. Bajar de cero lo impide el mismo
  `CHECK (stock >= 0)` que protege el checkout.
- **Pedidos**: pagado → enviado → entregado, o cancelado mientras no se haya
  enviado. Cancelar y reponer el stock van en **una sola sentencia** (un `WITH`
  con dos `UPDATE`), y el estado de partida va en el `WHERE`: si dos personas
  pulsan a la vez "enviar" y "cancelar", solo una de las dos acciones se aplica.
- **Informes**: ventas por periodo en **Excel** (cuatro hojas: resumen, por
  día, por producto y pedidos) y en **PDF** (resumen, ventas por producto con
  total y días con ventas), generados por Orion sin librerías externas.
- **Importar**: un CSV de hasta 50 MB desde el navegador.

**Los informes van por la cola.** Pedir un informe crea el informe y su
trabajo en una sola sentencia, y el worker lo genera y guarda el archivo en
Postgres (`BYTEA`), no en su disco: el worker y la instancia web que lo sirve
son procesos distintos y en el compose no comparten disco. La instancia lo baja
de la base la primera vez y lo reutiliza, porque un informe listo ya no cambia.

## La carga masiva

```bash
bash pruebas/carga-masiva.sh            # genera, importa y mide 1.000.000 de productos
bash pruebas/carga-masiva.sh limpiar    # los quita
```

La importación tiene tres pasos, todos en Postgres:

1. **COPY** del CSV a una tabla de paso, en *streaming*: Orion lo envía en
   trozos de 64 KB y nunca tiene el archivo entero en memoria.
2. **Revisión** de todas las filas a la vez, para decir qué SKU falla y por
   qué, en lugar de pararse en la primera.
3. **Fusión** con el catálogo en una sola sentencia: lo nuevo se da de alta y
   lo que ya existía se actualiza, sin tocar su stock.

### Medido

Un millón de productos, 94 MB de CSV, en un portátil (i7-1165G7, Windows 11,
Postgres 17 en Docker):

| Paso | Tiempo |
|---|---|
| COPY a la tabla de paso | **1,6 s** |
| Revisión de las filas | 2,9 s |
| Fusión con el catálogo | 65,6 s |
| **Pico de RAM del proceso de Orion** | **31 MB** |

Con 50.000 filas el pico es de 32 MB: **la memoria no depende del tamaño del
archivo**.

El tiempo se va en la fusión, y es trabajo de Postgres: calcular el `tsvector`
de cada fila y mantener los índices. Se probó a quitar los índices durante la
carga y reconstruirlos al final, que es la receta habitual, y **no mejora**:

| Variante | Insertar | Reconstruir índices | Total |
|---|---|---|---|
| Con todos los índices (como queda) | 57,5 s | — | 57,5 s |
| Sin el índice GIN | 45,4 s | 18,0 s | 63,4 s |
| Sin ningún índice secundario | 33,3 s | 24,4 s | 57,7 s |

Reconstruir un índice sobre toda la tabla cuesta lo mismo que mantenerlo fila
a fila, y mientras tanto la búsqueda de la tienda iría sin índice. Así que la
fusión se queda como está.

### La búsqueda con un millón de productos

```
«kx500007»  (1 coincide)            ILIKE   651 ms    texto completo    0,08 ms
«auriculares»  (100.002)            ILIKE 1.313 ms    texto completo     250 ms
«Monitor Farol»  (66.667)           ILIKE   431 ms    texto completo     216 ms
portada, sin búsqueda                                                    0,12 ms
```

`ILIKE '%texto%'` recorre la tabla entera en cada tecla. La búsqueda va contra
una columna `tsvector` con índice GIN, y cada palabra se busca como prefijo,
para que funcione mientras se teclea.

**El índice no bastaba.** La primera versión tardaba **2.197 ms** en la
aguja, más que el ILIKE. Postgres estimaba 20.000 coincidencias en vez de una,
así que recorría el millón de filas en orden (para el `ORDER BY ... LIMIT`)
filtrando una a una, sin usar el GIN. La consulta separa ahora las dos fases:
primero las coincidencias (`WITH ... AS MATERIALIZED`) y después el orden. Con
eso, 0,08 ms.

## Arquitectura

```
                    nginx  :8086
                      |
        +-------------+-------------+
        |             |             |
      app1          app2          app3        (tres procesos web)
        |             |             |
        +-------------+-------------+
                      |
                  PostgreSQL  <---- worker1, worker2   (dos procesos de fondo)
```

Ninguna instancia guarda nada en su memoria: la sesión viaja en el JWT y todo
lo demás vive en Postgres. Por eso **no hacen falta sesiones pegajosas** en el
balanceador, y añadir una cuarta instancia es una línea en el compose.

Eso no es un detalle menor. Los módulos `session`, `cache`, `state` y `cola`
de Orion guardan su estado en **la memoria del proceso**: van bien dentro de
un servidor y dejan de ir en cuanto hay dos. Esta demo no usa ninguno de los
cuatro, a propósito.

### Comprobado con tres procesos

Los seis compradores de la prueba anterior, ahora repartidos por el
balanceador entre instancias distintas:

```
app1  22:35:22  POST /api/checkout  409
app2  22:35:22  POST /api/checkout  201   <- la unica venta
app2  22:35:22  POST /api/checkout  409
app2  22:35:22  POST /api/checkout  409
app3  22:35:22  POST /api/checkout  409
app3  22:35:22  POST /api/checkout  409
```

Tres procesos que no se conocen entre sí, y se vende exactamente una unidad:
**la corrección vive en la base, no en el proceso.**

## La cola de trabajos

Al comprar hay cosas que no deben hacer esperar al cliente: generar la
factura, mandar el correo, avisar al almacén. Van a una cola.

**No se usa el módulo `cola` de Orion**, que guarda los trabajos en memoria:
con dos instancias cada una tendría los suyos y un reinicio se llevaría lo
pendiente. Aquí los trabajos son filas de una tabla.

**El trabajo se encola dentro de la transacción de la compra.** Si la compra
se revierte, el trabajo no existe; si se confirma, existe seguro. Encolarlo
después del commit abriría una ventana en la que el proceso puede morir
dejando un pedido sin factura.

**La reclamación es una sola sentencia:**

```sql
UPDATE trabajos SET estado = 'procesando', intentos = intentos + 1, tomado_por = ?
WHERE id = (
    SELECT id FROM trabajos
    WHERE estado = 'pendiente' AND ejecutar_en <= now()
    ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
)
RETURNING id, tipo, datos, intentos, max_intentos
```

`SKIP LOCKED` es lo que hace que dos workers no se lleven el mismo trabajo: el
segundo ni siquiera ve la fila que el primero tiene bloqueada. Va en una sola
sentencia porque `db.transaction` recibe una lista cerrada y no deja leer a
mitad para decidir.

Lo demás que tiene: reintentos con espera creciente (5s, 10s, 20s), un tope de
intentos antes de marcar el trabajo como fallido, y un rescate que devuelve a
la cola lo que quedó atascado en un worker que murió.

```bash
bash pruebas/cola-paralela.sh 30
```

```
Encolados 30 trabajos

Reparto:
  w1: 10
  w2: 10
  w3: 10

  trabajos hechos:           30   (debe ser 30)
  procesados mas de una vez:  0   (debe ser 0)
```

## Ejecutar

La demo trae su propio PostgreSQL, en el **puerto 5433** para no chocar con
uno que ya tengas instalado:

**Todo el sistema** (Postgres, tres instancias, dos workers y el balanceador):

```bash
docker compose up -d --build
```

→ http://localhost:8086

**Solo para desarrollar** (una instancia en tu máquina, con recarga
automática):

```bash
docker compose up -d postgres
orion watch backend/main.orx      # http://localhost:8083 (panel: /admin.html)
orion run   backend/worker.orx    # en otra terminal: facturas e informes
```

El esquema y el catálogo de siembra se crean solos al arrancar, y solo la
primera vez: reiniciar no duplica nada.

Para apuntar a otra base, la única variable que hace falta:

```bash
ORION_BD="postgres://usuario:clave@host:5432/base" orion watch backend/main.orx
```

| Variable | Por defecto | Para qué |
|---|---|---|
| `PORT` | `8083` | Puerto de escucha |
| `ORION_BD` | el Postgres del compose | Cadena de conexión |
| `ORION_FRONTEND` | `frontend` | Carpeta de estáticos |
| `ORION_JWT` | valor de desarrollo | Secreto de firma de los tokens |
| `ORION_ADMIN_EMAIL` | `admin@comercio.test` | Cuenta de administración que se siembra al arrancar |
| `ORION_ADMIN_PASS` | `admin-de-juguete` | Su contraseña |
| `ORION_TMP` | `tmp` | Carpeta de archivos de paso (informes a medio generar) |

Las credenciales del `docker-compose.yml` son de juguete y están a la vista a
propósito: la base vive en un contenedor local y no guarda nada real.

## Lo que ya se puede probar

```bash
curl -s "localhost:8083/api/productos?q=teclado"   # búsqueda por texto
curl -s "localhost:8083/api/productos?cat=audio"   # filtro por categoría
curl -s "localhost:8083/api/productos/ACC-04"      # ficha por SKU
curl -s localhost:8083/health                      # estado y resumen
```

Y las cuentas:

```bash
# Crear una cuenta (devuelve el token, ya dentro)
curl -s -X POST localhost:8083/api/registro -H "Content-Type: application/json"      -d '{"email":"ana@ejemplo.com","pass":"contrasena-larga","nombre":"Ana"}'

# Entrar
curl -s -X POST localhost:8083/api/login -H "Content-Type: application/json"      -d '{"email":"ana@ejemplo.com","pass":"contrasena-larga"}'

# Ruta protegida: sin token responde 401 y el handler ni se ejecuta
curl -s -o /dev/null -w "%{http_code}
" localhost:8083/api/yo
curl -s -H "Authorization: Bearer <token>" localhost:8083/api/yo
```

Tres decisiones de la fase 2 que se ven en `backend/cuentas.orx`:

- **Se guarda el hash argon2id**, nunca la contraseña. El `$argon2id$v=19$...`
  que queda en la tabla no se puede deshacer.
- **El mismo error para email inexistente y contraseña equivocada.** Decir cuál
  de las dos falló regala una lista de emails registrados.
- **Registrarse ya te deja dentro.** Pedir el login otra vez es una molestia
  sin ninguna ganancia.

La búsqueda y los filtros los resuelve Postgres con `ILIKE` y parámetros
enlazados, no un bucle en Orion: con el catálogo de un millón de filas de la
fase 5, traerse todo a memoria para descartarlo sería el final de la demo.
