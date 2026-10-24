# Cheaster

Ajedrez 6x6 sin caballos, con modo online. Un juego de [izarren.top](https://www.izarren.top/).

- `servidor/`: programa Node (socket.io) que sirve el juego y las partidas online, más `instalar.sh` para el VPS.
- `fuente/`: código del juego por partes (`src/`), `build.py` para generar `index.html` y las pruebas.

## Instalar o actualizar en el VPS
```
cd /root && git clone https://github.com/Pedro-5D/cheaster cheaster-repo   # la primera vez
cd /root/cheaster-repo && git pull && bash servidor/instalar.sh
```
Más detalles en `servidor/LEEME-SERVIDOR.md`.
