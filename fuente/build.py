import re,os,sys
# Uso: python3 build.py            -> dist/index.html  (servidor en el mismo sitio)
#      python3 build.py "" dist-itch itch  -> versión para itch.io (solo IA + enlace a la web)
servidor = sys.argv[1].rstrip('/') if len(sys.argv)>1 else ''
destino = sys.argv[2] if len(sys.argv)>2 else 'dist'
modo = sys.argv[3] if len(sys.argv)>3 else ''
eng=open('src/engine.js').read()
assert '</script' not in eng
app=open('src/app.html').read()
out=app.replace('/*__ENGINE__*/',eng).replace('/*__SERVIDOR__*/',servidor).replace('/*__MODO__*/',modo)
os.makedirs(destino,exist_ok=True)
open(destino+'/index.html','w').write(out)
print(destino, len(out))
