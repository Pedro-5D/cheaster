# Cheaster online: instalación en el VPS

Un solo programa (Node + socket.io) sirve el juego **y** las partidas online. No necesita base de datos.

## Una vez (primera instalación)
1. **DNS**: crea un registro `A` llamado `cheaster` (cheaster.izarren.top) con la IP de tu VPS, igual que hiciste con planchis.
2. **Sube** la carpeta `servidor` al VPS (por ejemplo con `scp -r servidor root@srv801859:/root/cheaster-subida`).
3. En el VPS:
   ```
   cd /root/cheaster-subida
   bash instalar.sh
   certbot --nginx -d cheaster.izarren.top
   ```
4. Abre https://cheaster.izarren.top y prueba **Online → Crear partida**.

## Para actualizar
Sube la carpeta de nuevo y ejecuta otra vez `bash instalar.sh`. Las partidas en curso se conservan (se guardan en `/root/cheaster/datos`).

## Comandos útiles
- `pm2 logs cheaster` ver qué pasa · `pm2 restart cheaster` reiniciar · `curl http://127.0.0.1:3100/salud` comprobar que vive.

## Notas
- Las salas caducan a las 24 h sin actividad. Los códigos son de 5 letras/números.
- Si un jugador se va y no vuelve en 60 s, el otro puede reclamar la victoria.
- Para incrustarlo en izarren.top: `<iframe src="https://cheaster.izarren.top/" ...>` con el mismo script de altura automática (mensaje `cheasterAltura`).
