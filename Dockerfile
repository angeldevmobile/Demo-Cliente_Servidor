# Comercio: imagen de despliegue.
#
# No compila nada. Baja un binario y copia el codigo: por eso la imagen final
# pesa ~120 MB y arranca en milisegundos.
# Ubuntu 24.04 y no Debian 12: el binario publicado de Orion se compila en
# ubuntu-latest y exige GLIBC 2.39, que Debian bookworm (2.36) no tiene.
FROM ubuntu:24.04

# 0.1.8 como mínimo: la pasarela monta sus rutas pasando funciones de su
# módulo, y usa los timeouts de net. 0.1.7 trajo process.version/memory, y
# 0.1.6 trajo `and`/`or` con cortocircuito, `attempt` en
# handlers de serve y los errores de Postgres con SQLSTATE.
ARG ORION_VERSION=v0.1.8

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && curl -fsSL -o /usr/local/bin/orion \
      "https://github.com/angeldevmobile/Orion/releases/download/${ORION_VERSION}/orion-linux-x64" \
 && chmod +x /usr/local/bin/orion \
 && apt-get purge -y curl && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/  backend/
COPY frontend/ frontend/
COPY datos/    datos/
COPY herramientas/ herramientas/
COPY pasarela/ pasarela/
COPY despliegue/arranque.sh despliegue/arranque.sh

ENV PORT=8083
EXPOSE 8083

CMD ["orion", "--run", "backend/main.orx"]
