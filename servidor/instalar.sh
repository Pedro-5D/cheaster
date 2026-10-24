#!/bin/bash
# Instala o actualiza Cheaster en el VPS. Ejecutar como root DENTRO de la carpeta "servidor" ya subida.
#   bash instalar.sh
# Puerto interno: 3100 (cámbialo con PUERTO=3101 bash instalar.sh si estuviera ocupado)
set -e
ORIGEN="$(cd "$(dirname "$0")" && pwd)"
cd "$ORIGEN"
PUERTO=${PUERTO:-3100}
DESTINO=/root/cheaster
DOMINIO=${DOMINIO:-cheaster.izarren.top}

command -v node >/dev/null || { echo "Falta Node.js"; exit 1; }
command -v pm2 >/dev/null || { echo "Falta pm2 (npm i -g pm2)"; exit 1; }
if ss -ltn | grep -q ":$PUERTO " && ! pm2 describe cheaster >/dev/null 2>&1; then
  echo "El puerto $PUERTO ya está en uso por otra cosa. Prueba: PUERTO=3101 bash instalar.sh"; exit 1
fi

mkdir -p "$DESTINO"
# copia el programa y la web sin tocar las partidas guardadas (datos/)
cp -r server.js engine.js package.json public "$DESTINO"/
cd "$DESTINO"
npm install --omit=dev

if pm2 describe cheaster >/dev/null 2>&1; then
  pm2 restart cheaster --update-env
else
  PORT=$PUERTO pm2 start server.js --name cheaster
fi
pm2 save

# nginx (solo si no existe ya)
CONF=/etc/nginx/sites-available/$DOMINIO
if [ ! -f "$CONF" ]; then
  cp "$ORIGEN/cheaster.nginx.conf" "$CONF"
  sed -i "s/cheaster.izarren.top/$DOMINIO/; s/127.0.0.1:3100/127.0.0.1:$PUERTO/" "$CONF"
  ln -sf "$CONF" /etc/nginx/sites-enabled/$DOMINIO
  nginx -t && systemctl reload nginx
  echo "nginx configurado para $DOMINIO"
fi

sleep 1
curl -s "http://127.0.0.1:$PUERTO/salud" && echo
echo
echo "Listo. Si aún no tiene https, ejecuta (cuando el DNS ya apunte aquí):"
echo "  certbot --nginx -d $DOMINIO"
