#!/bin/sh
# Web y worker en el mismo contenedor (plan gratuito de Render).
# La web va en primer plano: si se detiene, Render reinicia el contenedor.
orion run backend/worker.orx &
exec orion run backend/main.orx
