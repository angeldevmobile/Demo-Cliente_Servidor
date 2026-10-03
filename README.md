# Comercio

Una tienda con catálogo, cuentas de usuario, carrito y compra real, escrita
entera en Orion sobre **PostgreSQL**.

Las otras demos de esta carpeta responden a "¿esto funciona?". Esta responde a
la pregunta que viene después: **"¿aguanta un proyecto de verdad?"**. Backend
repartido en varios archivos, autenticación con contraseñas, dinero, stock, y
una operación que no puede salir a medias.

> **Estado: las diez fases terminadas.** Catálogo, cuentas con JWT, compra
> transaccional, pago con una pasarela simulada y webhooks firmados, factura
> en PDF enviada por correo, panel de
> administración con informes en Excel y PDF, carga masiva de un millón de
> productos, despliegue con balanceador y tres instancias, cola de trabajos en
> Postgres con workers aparte, y una página que enseña todo eso en vivo.
>
> **Necesita Orion 0.1.9 o posterior** (los secretos van con el módulo `secret`).
> Desde la 0.1.8: la pasarela monta sus propias rutas
> pasando funciones de su módulo y usa los timeouts de `net`, y la factura
> sale con `mail.send` y su PDF adjunto. Construirla destapó varios fallos del
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
| Un backend se puede partir en módulos | 17 archivos `.orx` que se importan entre sí |
| Las contraseñas se guardan bien | `argon2`, nunca la contraseña en claro |
| Las sesiones son reales | JWT firmado, rutas protegidas con `router.guard` |
| El dinero no se pierde | Checkout dentro de una transacción, con `ROLLBACK` si falla |
| El stock no se vende dos veces | Bloqueo de fila en Postgres, probado con compradores simultáneos |
| Los informes salen del mismo lenguaje | Excel y PDF generados por Orion, sin librerías externas |
| La factura llega sola | PDF generado por un worker y enviado por correo con el PDF adjunto |
| Los datos entran rápido | Catálogo de un millón de filas por `COPY`, con la RAM medida |
| Un pago no se cuenta dos veces | Webhook firmado con HMAC, reenviado a propósito, aplicado una sola vez |
| Todo eso se puede ver | `/monitor.html`: procesos, cola y carrera en vivo, sin leer logs |

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
│   ├── importar.orx     carga masiva del catálogo por COPY
│   ├── monitor.orx      procesos, cola, carrera y búsqueda medida
│   ├── pagos.orx        cargo, aviso firmado, caducidad y conciliación
│   ├── facturas.orx     factura en PDF, correo con el adjunto y descarga
│   └── limite.orx       límite de peticiones por cliente, contado en Postgres
├── pasarela/            la pasarela simulada, otro servicio de Orion
│   ├── pasarela.orx     cargos, página de pago y avisos firmados
│   ├── main.orx         la pasarela como servidor aparte
│   └── pagar.html       la página donde se paga
├── frontend/
│   ├── index.html       tienda y carrito
│   ├── admin.html       panel de administración
│   ├── app.js
│   ├── admin.js
│   ├── monitor.html     Orion funcionando, en vivo
│   ├── monitor.js
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
├── docker-compose.yml   Postgres, tres instancias, dos workers, pasarela, Mailpit y nginx
├── render.yaml          despliegue en Render (Blueprint)
└── Dockerfile
```

Cada archivo del backend se importa con `use "backend/pedidos" as pedidos` y
expone sus funciones. Es la primera demo de esta carpeta que no cabe en un
archivo, y esa es justamente la intención.

## Modelo de datos

```
usuarios     id, email, hash_pass, nombre, rol, creado
productos    id, sku, nombre, descripcion, categoria, precio, stock, activo,
             detalle, caracteristicas (separadas por '|'), busqueda (tsvector)
carritos     id, usuario_id, creado
lineas       id, carrito_id, producto_id, cantidad
pedidos      id, usuario_id, total, estado, creado
pedido_items id, pedido_id, producto_id, cantidad, precio_unitario
trabajos     id, tipo, datos, estado, intentos, ejecutar_en, tomado_por, …
facturas     id, pedido_id, numero, contenido, pdf (BYTEA), bytes, enviada, …
informes     id, formato, desde, hasta, estado, contenido (BYTEA), bytes, …
procesos     nombre, tipo, version, pid, arranco, senal, rss, pico
limites      clave, ventana, veces
pagos_avisos id, evento, cargo_id, pedido_id, resultado, veces, recibido
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
| `GET` | `/api/productos/:sku` | Ficha: detalle, características y relacionados |
| `GET` | `/api/carrito` | Carrito del usuario |
| `POST` | `/api/carrito` | Añade un producto, con su cantidad |
| `PUT` | `/api/carrito/:id` | Cambia la cantidad de una línea |
| `DELETE` | `/api/carrito/:id` | Quita una línea |
| `POST` | `/api/checkout` | **Compra: la operación que importa** |
| `GET` | `/api/pedidos` | Historial del usuario, con sus líneas y su factura |
| `POST` | `/api/pedidos/:id/pagar` | Crea (o reutiliza) el cargo y devuelve la URL de pago |
| `GET` | `/api/pedidos/:id/factura` | El PDF de la factura, solo para el dueño del pedido |
| `POST` | `/api/pagos/aviso` | Webhook de la pasarela: sin JWT, lo autentica la firma |
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
| `GET` | `/api/monitor` | Procesos vivos, estado de la cola y últimos trabajos |
| `POST` | `/api/monitor/carrera` | Prepara la carrera: stock 1 y N compradores con él en el carrito |
| `GET` | `/api/monitor/carrera` | Stock final y unidades vendidas |
| `GET` | `/api/monitor/busqueda` | Texto completo frente a ILIKE, con `EXPLAIN ANALYZE` |

Todo lo que cuelga de `/api/carrito`, `/api/checkout`, `/api/pedidos` y
`/api/admin` va detrás de `router.guard`: sin un JWT válido, `serve` responde
401 y el handler ni se ejecuta. `/api/admin` pasa además por un middleware que
exige el rol `admin` en el token (403 si no).

### Límite de peticiones

Las rutas públicas que escriben o cuestan tienen un cupo por IP y, algunas,
otro entre todos los clientes. Pasado el cupo responden **429**.

| Ruta | Por IP | Entre todos | Ventana |
|---|---|---|---|
| `POST /api/registro` | 20 | 300 | 1 hora |
| `POST /api/login` | 30 | — | 5 minutos |
| `POST /api/checkout` | 60 | — | 1 minuto |
| `POST /api/monitor/carrera` | 10 | 60 | 1 minuto |
| `GET /api/monitor/busqueda` | 30 | 300 | 1 minuto |

**No se usa `middleware.rate_limit` de Orion**, por lo mismo que no se usa su
módulo `cola`: cuenta en la memoria del proceso, y con tres instancias el cupo
real sería el triple. Aquí cada petición es una fila en `limites`, sumada con un
`INSERT ... ON CONFLICT DO UPDATE ... RETURNING veces`: una sola sentencia, así
que dos instancias que cuentan a la vez no pierden ninguna. El worker borra las
ventanas viejas.

Detrás de un proxy, la IP de la conexión es la del proxy. `ORION_IP_CABECERA`
dice en qué cabecera viene la del cliente: `x-real-ip` en el compose (nginx la
pisa, no se puede falsear) y `x-forwarded-for` en Render. Esa última sí la
puede falsear el cliente, y para eso está el tope entre todos: aunque alguien
cambie de IP en cada petición, no pasa de 300 registros por hora.

## El checkout, que es el corazón

Cuatro sentencias en **una** transacción, y el orden importa: el descuento de
stock va primero porque es lo único que puede fallar. El pedido nace
`pendiente_pago`: el stock queda reservado y el cobro lo confirma después la
pasarela (ver "El pago").

```sql
BEGIN
  UPDATE productos p SET stock = p.stock - l.cantidad     -- puede fallar aquí
    FROM lineas l WHERE l.producto_id = p.id AND l.carrito_id = ?
  INSERT INTO pedidos (usuario_id, total, estado, expira)
    SELECT ?, SUM(p.precio * l.cantidad), 'pendiente_pago', now() + '15 minutes' ...
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
   con compradores simultáneos. La tienda tiene ficha de producto (con
   cantidad), carrito con − y +, confirmación de compra y "Mis pedidos", donde
   la factura que genera el worker aparece sola a los pocos segundos.
4. ✅ **Panel de administración**: productos, stock, pedidos e informes en
   Excel y PDF generados por un worker.
5. ✅ **Carga masiva**: un millón de productos por `COPY`, con el tiempo, la
   RAM y la búsqueda medidos.
6. ✅ **Despliegue**: `docker compose up` levanta Postgres, **tres instancias**
   web, **dos workers** y un nginx que reparte.
7. ✅ **Cola de trabajos**: tabla en Postgres con reclamación atómica, workers
   como procesos aparte, y la factura encolada en la misma sentencia que
   confirma el pago.
8. ✅ **Monitor**: `/monitor.html` enseña en vivo los procesos, la cola,
   la carrera por la última unidad y la búsqueda medida.
9. ✅ **Pago**: pasarela simulada, aviso firmado con HMAC e idempotente,
   caducidad de los pedidos sin pagar y conciliación de avisos perdidos.
10. ✅ **Factura**: PDF generado por el worker al confirmarse el pago,
    descargable desde "Mis pedidos" y enviado por correo con el PDF adjunto.

Mientras una fase no esté, sus controles no aparecen en la página: es
preferible a enseñar botones que devuelven 404. El interruptor está arriba de
`frontend/app.js`.

## El pago

Una pasarela simulada, escrita también en Orion, que imita a las que se usan
en Perú (Culqi, Izipay, Niubiz, Mercado Pago): la tienda crea un cargo, el
cliente paga en la página de la pasarela, y la pasarela avisa a la tienda.

```
tienda ──POST /api/cargos──▶ pasarela         (con la clave de la tienda)
cliente ──────────────────▶ /pasarela/pagar/cg_…   (tarjeta de prueba)
pasarela ──POST /api/pagos/aviso──▶ tienda    (firmado, y dos veces)
```

- **Comprar reserva, no cobra.** El pedido nace `pendiente_pago` con el stock
  descontado hasta `expira` (15 minutos, `ORION_PAGO_MINUTOS`). Lo que lo
  confirma es el aviso de la pasarela, nunca que el navegador vuelva a la
  tienda: esa vuelta la puede fingir cualquiera.
- **El aviso va firmado.** `X-Pasarela-Firma: t=…,v1=…` es un HMAC-SHA256 de
  `t.cuerpo` con un secreto compartido. Sin firma, 400; con firma mala o con
  más de 5 minutos, 401. `crypto.verify` compara en tiempo constante.
- **Se cuenta una sola vez.** La pasarela manda cada aviso **dos veces** a
  propósito, como hacen las de verdad. Registrar el aviso, pasar el pedido a
  `pagado` y encolar la factura van en **una sola sentencia**; el repetido solo
  suma a `veces`. Se ve en el monitor.
- **Lo que no se paga caduca.** El worker devuelve el stock de los pedidos
  vencidos, en la misma sentencia que los marca `caducado`. Si el dinero llega
  después, el pedido queda marcado para devolverlo, no se pierde en silencio.
- **Un aviso perdido se recupera.** Si la tienda estaba caída cuando avisaron,
  el worker pregunta a la pasarela por los cargos que llevan más de un minuto
  sin respuesta (conciliación).
- **Reintentar no cobra dos veces.** Pedir el pago otra vez devuelve el mismo
  cargo, y un cargo pagado no se puede volver a pagar.

Tarjetas de prueba: `4111 1111 1111 1111` se aprueba, `4000 0000 0000 0002`
la rechaza el banco y `4000 0000 0000 9995` no tiene fondos (cualquier otro
número válido por Luhn también se aprueba). Caducidad futura y CVC de 3 cifras.

En el compose la pasarela es **otro servicio** (`pasarela`, detrás de nginx en
`/pasarela/`). Sin `ORION_PASARELA_URL`, como en Render, se monta dentro de la
misma tienda con `pasarela.montar(router)`: el mismo código, sin un segundo
proceso. Cambiarla por una de verdad es cambiar `pagos.orx`, no el checkout.

## La factura

Cuando el pago se confirma, el worker genera la factura en **PDF** con
`pdf.build` (con el color de la marca, `ORION_COLOR_MARCA`) y la guarda en
Postgres. En la misma sentencia encola el correo, y **solo la primera vez**:
si el trabajo de la factura se reintenta, el cliente no recibe dos correos.

Otro trabajo la manda con `mail.send`, con texto y HTML alternativos y el PDF
adjunto, sin pasar por disco: Postgres la devuelve en base64 y así viaja. Si
el servidor de correo falla, el trabajo se reintenta como cualquier otro y
el error queda en `facturas.correo_error`.

Sin `ORION_SMTP_HOST` no se manda nada y no es un error: la factura sigue en
"Mis pedidos", donde el cliente la descarga. En el compose el correo va a
**Mailpit**, un buzón falso: abre **http://localhost:8025** y ahí están los
correos de cada compra con su PDF.

## Monitor

`/monitor.html`, pública. Esta demo no vende nada de verdad: lo que tiene
que enseñar es qué hace Orion por detrás, y aquí se ve sin leer logs.

- **Procesos.** Cada instancia web y cada worker anota en la tabla `procesos`
  su versión de Orion, su PID y su memoria (`process.version`,
  `process.memory`). La página pregunta cada 2 s, y como cada respuesta lleva
  la cabecera `X-Orion-Instancia`, se ve cómo el balanceador reparte.
- **La cola.** Trabajos por estado, los últimos doce con quién los hizo, cuánto
  esperaron y cuánto tardaron, y el reparto entre workers.
- **La carrera.** Un producto con stock 1 y de 2 a 6 compradores con él en el
  carrito. Las compras salen a la vez desde el navegador y llegan a instancias
  distintas: **una sola** responde 201, el resto 409, y el stock queda en 0.
  Es `pruebas/compra-simultanea.sh` convertido en un botón. El producto está
  oculto, cuesta 0 € y las cuentas son propias, así que no toca la tienda; cada
  carrera borra la anterior.
- **La búsqueda.** La consulta de la tienda frente a `ILIKE`, con el tiempo y
  los nodos del plan de `EXPLAIN ANALYZE`. Con el catálogo de siembra (24
  productos) Postgres recorre la tabla en los dos casos, porque es lo más
  barato; el índice GIN se nota con la carga masiva.

Con `docker compose` se ven las tres instancias y los dos workers, y la barra
de reparto de la página muestra a nginx turnando las peticiones. En local, con
un solo proceso web, todo lo atiende `local`.

## El panel de administración

`/admin.html`, solo para cuentas con rol `admin`. Registrarse siempre da rol
`cliente`: el administrador se siembra al arrancar con `ORION_ADMIN_EMAIL` y
`ORION_ADMIN_PASS`, que vienen de `.env` (ver "Secretos"). Si alguien se
registró antes con ese email, no se le asciende.

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
- **Importar**: un CSV de hasta 50 MB desde el navegador. Columnas
  obligatorias `sku,nombre,descripcion,categoria,precio,stock`, en cualquier
  orden; `detalle` y `caracteristicas` son opcionales, y si no vienen, la ficha
  que ya tenía cada producto se conserva. `datos/catalogo.csv` sirve tal cual.

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
                      ^
                      +---- pasarela       (/pasarela/ en nginx, otro proceso)
```

Cada respuesta JSON lleva la cabecera `X-Orion-Instancia` con el nombre de la
instancia que la atendió (`ORION_INSTANCIA`), así que el reparto se ve desde el
navegador y no solo en los logs.

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

**El trabajo se encola en la misma sentencia que confirma el pago.** Si la
confirmación no se aplica, el trabajo no existe; si se aplica, existe seguro.
Encolarlo después abriría una ventana en la que el proceso puede morir
dejando un pedido pagado sin factura.

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
uno que ya tengas instalado. Antes de nada, crea tu `.env` con los secretos:

```bash
cp .env.example .env      # y cambia los valores
```

**Todo el sistema** (Postgres, tres instancias, dos workers y el balanceador):

```bash
docker compose up -d --build
```

→ http://localhost:8086 · panel en `/admin.html` · monitor en `/monitor.html` ·
correos en http://localhost:8025

La imagen descarga el binario de Orion de GitHub Releases; la versión va en
`ORION_VERSION`, arriba del `Dockerfile`.

**Solo para desarrollar** (una instancia en tu máquina, con recarga
automática):

```bash
docker compose up -d postgres
orion watch backend/main.orx      # http://localhost:8083 (/admin.html, /monitor.html)
orion run   backend/worker.orx    # en otra terminal: facturas e informes
```

El esquema y el catálogo de siembra se crean solos al arrancar, y solo la
primera vez: reiniciar no duplica nada.

## Secretos

Ninguna clave está escrita en el código ni en el compose. La tienda los lee con
el módulo `secret` de Orion, que:

- los busca en el entorno, en `NOMBRE_FILE` (secretos de Docker o Kubernetes) o,
  solo en desarrollo, en `.env`, que no se sube a git (`.env.example` es la plantilla);
- comprueba todos al arrancar y lista juntos los que faltan o son demasiado cortos;
- los muestra como `***` en `show`, logs, errores y en el log de `serve`.

Con `ORION_ENV=production` (como en Render) no se lee ningún `.env` ni se acepta
un valor por defecto: si falta un secreto, el servidor no arranca.

| Secreto | Para qué |
|---|---|
| `ORION_BD` | Cadena de conexión a Postgres (lleva la contraseña) |
| `ORION_JWT` | Firma de los tokens; 32 caracteres o más |
| `ORION_ADMIN_PASS` | Contraseña del administrador; 12 o más |
| `ORION_PASARELA_CLAVE` | Clave de la tienda ante la pasarela; 16 o más |
| `ORION_PASARELA_SECRETO` | Firma de los avisos de la pasarela; 32 o más |
| `ORION_SMTP_CLAVE` | Contraseña SMTP, si el servidor la pide |
| `POSTGRES_PASSWORD` | Contraseña del Postgres del compose |

La configuración que no es secreta va por variables normales:

| Variable | Por defecto | Para qué |
|---|---|---|
| `ORION_ENV` | (vacía: desarrollo) | `production` exige todos los secretos del entorno |
| `PORT` | `8083` | Puerto de escucha |
| `ORION_FRONTEND` | `frontend` | Carpeta de estáticos |
| `ORION_ADMIN_EMAIL` | `admin@comercio.test` | Cuenta de administración que se crea al arrancar |
| `ORION_TMP` | `tmp` | Carpeta de archivos de paso (informes a medio generar) |
| `ORION_INSTANCIA` | `local` | Nombre de la instancia web, el que sale en el monitor |
| `ORION_IP_CABECERA` | (vacía: IP de la conexión) | Cabecera donde el proxy pone la IP del cliente, para el límite de peticiones |
| `ORION_WORKER` | `worker-1` | Nombre del worker, el que sale en la cola |
| `ORION_PASARELA_URL` | (vacía: integrada) | API de la pasarela; vacía, se monta en este proceso bajo `/pasarela` |
| `ORION_URL_INTERNA` | `http://127.0.0.1:PORT` | Desde donde la pasarela llama al webhook |
| `ORION_PAGO_MINUTOS` | `15` | Cuánto se reserva el stock de un pedido sin pagar |
| `ORION_SMTP_HOST` | (vacía: sin correo) | Servidor SMTP para mandar las facturas |
| `ORION_SMTP_PUERTO` | `587` | Su puerto |
| `ORION_SMTP_SEGURIDAD` | `starttls` | `tls`, `starttls` o `ninguna` |
| `ORION_SMTP_USUARIO` | (vacía) | Usuario SMTP, si el servidor lo pide |
| `ORION_CORREO_DE` | `Comercio <tienda@comercio.test>` | Remitente de las facturas |
| `ORION_COLOR_MARCA` | `#1f6f4a` | Color de las facturas y los informes |

## Desplegar en Render

El repositorio trae un `render.yaml`: en Render, **New → Blueprint** y se elige
este repositorio. Crea una base Postgres y la web, con las variables ya
enlazadas, y solo pide dos: `ORION_ADMIN_EMAIL` y `ORION_ADMIN_PASS`. Corre con
`ORION_ENV=production`: los demás secretos los genera Render, y si falta alguno
el servicio no arranca.

En el plan gratuito el worker corre en el mismo contenedor que la web, porque
Render no da workers gratis. Funciona porque la cola y los informes viven en
Postgres; para algo serio, el worker va como *Background Worker* aparte, con
`orion run backend/worker.orx` y las mismas variables.

Lo que hay que saber del plan gratuito:

- La web **se duerme** a los 15 minutos sin tráfico, y la primera visita tarda
  30-60 s en despertarla. Mientras duerme, el worker tampoco trabaja.
- La **Postgres gratuita caduca a los 30 días** y tiene 1 GB: sobra para la
  demo, no para la carga masiva del millón de productos.
- **Una sola instancia**: el monitor enseña `render-web` y `render-worker`. La
  app ya está hecha para escalar (JWT, cola en Postgres, nada en disco), pero
  varias instancias en Render son de pago.
- Las fechas van en **UTC**: «ventas de hoy» cambia de día a las 19:00 de Perú.
- **Sin correo**: no hay servidor SMTP, así que las facturas no se mandan;
  se descargan desde "Mis pedidos". Para mandarlas, añade las variables
  `ORION_SMTP_*` de un proveedor (Brevo, Resend, el SMTP de tu dominio…).
- **La pasarela va dentro**: sin `ORION_PASARELA_URL`, la simulada se monta en
  el mismo proceso bajo `/pasarela`, y su clave y su secreto los genera
  Render.

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
curl -s -X POST localhost:8083/api/registro -H "Content-Type: application/json" \
     -d '{"email":"ana@ejemplo.com","pass":"contrasena-larga","nombre":"Ana"}'

# Entrar
curl -s -X POST localhost:8083/api/login -H "Content-Type: application/json" \
     -d '{"email":"ana@ejemplo.com","pass":"contrasena-larga"}'

# Ruta protegida: sin token responde 401 y el handler ni se ejecuta
curl -s -o /dev/null -w "%{http_code}\n" localhost:8083/api/yo
curl -s -H "Authorization: Bearer <token>" localhost:8083/api/yo
```

Tres decisiones de la fase 2 que se ven en `backend/cuentas.orx`:

- **Se guarda el hash argon2id**, nunca la contraseña. El `$argon2id$v=19$...`
  que queda en la tabla no se puede deshacer.
- **El mismo error para email inexistente y contraseña equivocada.** Decir cuál
  de las dos falló regala una lista de emails registrados.
- **Registrarse ya te deja dentro.** Pedir el login otra vez es una molestia
  sin ninguna ganancia.

La búsqueda y los filtros los resuelve Postgres, con texto completo y
parámetros enlazados, no un bucle en Orion: con el catálogo de un millón de
filas de la fase 5, traerse todo a memoria para descartarlo sería el final de
la demo.

Y el monitor, también por `curl`:

```bash
curl -s localhost:8083/api/monitor                        # procesos y cola
curl -s "localhost:8083/api/monitor/busqueda?q=teclado"   # tiempos y plan
curl -si localhost:8083/api/monitor | grep X-Orion        # quién atendió
```

## Licencia

[MIT](LICENSE), la misma que Orion.
