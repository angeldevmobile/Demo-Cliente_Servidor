#!/bin/sh
# Web y worker en el mismo contenedor, para el plan gratuito de Render (que
# no da workers gratis). La web va en primer plano: si cae, Render reinicia.
orion run backend/worker.orx &
exec orion run backend/main.orx
