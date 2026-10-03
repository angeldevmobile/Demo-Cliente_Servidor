# Imagen de la demo: descarga el binario de Orion y copia el código, sin compilar.
# Ubuntu 24.04 porque el binario publicado requiere GLIBC 2.39.
FROM ubuntu:24.04

# Versión mínima 0.1.9: los secretos se leen con el módulo `secret`,
# que los oculta en la salida y los exige en producción.
ARG ORION_VERSION=v0.1.9

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
