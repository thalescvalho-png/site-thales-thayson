#!/bin/bash
# Envia os arquivos do álbum para o R2 (bucket "correnteza").
#
# Uso (no Terminal, dentro da pasta backend):
#     ./scripts/enviar-r2.sh previews    # só as prévias (públicas)
#     ./scripts/enviar-r2.sh full        # faixas completas, encarte (PDF e JSON) e o .zip do álbum
#     ./scripts/enviar-r2.sh tudo        # as duas coisas
# Acrescente --local para mandar para o R2 de testes do "npm run dev".
#
# De onde vêm os arquivos (pasta correnteza-privado, ao lado do site):
#     previews/*.mp3          -> R2 previews/
#     faixas/*.mp3            -> R2 full/
#     encarte/Correnteza-Encarte.pdf -> R2 full/encarte.pdf
#     encarte/encarte.json    -> R2 full/encarte.json
#     (montado aqui)          -> R2 full/album.zip   (faixas com nomes bonitos + PDF)
set -euo pipefail

BUCKET="correnteza"
BACKEND="$(cd "$(dirname "$0")/.." && pwd)"
PRIVADO="${CORRENTEZA_PRIVADO:-$(cd "$BACKEND/../.." && pwd)/correnteza-privado}"
ONDE="--remote"
[[ " $* " == *" --local "* ]] && ONDE="--local"
QUAL="${1:-}"
cd "$BACKEND"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

enviar() { # chave arquivo tipo cache
  printf "  %-30s " "$1"
  if npx wrangler r2 object put "$BUCKET/$1" --file "$2" --content-type "$3" --cache-control "$4" "$ONDE" >"$TMP/log.txt" 2>&1; then
    echo "ok ($(du -h "$2" | cut -f1 | tr -d ' '))"
  else
    echo "FALHOU"; cat "$TMP/log.txt"; exit 1
  fi
}

enviar_previas() {
  local arquivos=("$PRIVADO"/previews/*.mp3)
  [ -f "${arquivos[0]}" ] || { echo "Não há prévias em $PRIVADO/previews. Rode ./scripts/gerar-previas.sh"; exit 1; }
  echo "Prévias (${#arquivos[@]}):"
  for f in "${arquivos[@]}"; do enviar "previews/$(basename "$f")" "$f" "audio/mpeg" "public, max-age=86400"; done
}

enviar_completos() {
  local faixas=("$PRIVADO"/faixas/*.mp3)
  [ -f "${faixas[0]}" ] || { echo "Não há faixas em $PRIVADO/faixas"; exit 1; }
  for necessario in encarte/Correnteza-Encarte.pdf encarte/encarte.json; do
    [ -f "$PRIVADO/$necessario" ] || { echo "Falta $PRIVADO/$necessario"; exit 1; }
  done

  python3 - "$PRIVADO/encarte/encarte.json" <<'PY' || exit 1
import json, sys
try:
    dados = json.load(open(sys.argv[1], encoding="utf-8"))
    assert dados["faixas"] and all(f["id"] and f["titulo"] and f["letra"] for f in dados["faixas"])
except json.JSONDecodeError as p:
    sys.exit(f"O encarte.json tem um erro na linha {p.lineno}, coluna {p.colno}: {p.msg}. Nada foi enviado.")
except (KeyError, AssertionError):
    sys.exit("O encarte.json está incompleto (faltam faixas, títulos ou letras). Nada foi enviado.")
PY

  echo "Montando o álbum em .zip..."
  python3 - "$PRIVADO" "$TMP" <<'PY'
import json, shutil, sys
from pathlib import Path
privado, tmp = Path(sys.argv[1]), Path(sys.argv[2])
encarte = json.loads((privado / "encarte" / "encarte.json").read_text(encoding="utf-8"))
pasta = tmp / "zip" / f'{encarte["artistas"]} - {encarte["album"]}'
pasta.mkdir(parents=True)
for f in encarte["faixas"]:
    origem = privado / "faixas" / f'{f["id"]}.mp3'
    if not origem.exists():
        sys.exit(f"Falta a faixa {origem}")
    nome = f'{f["numero"]:02d} - {f["titulo"]}.mp3'.replace("/", "-")
    shutil.copy(origem, pasta / nome)
shutil.copy(privado / "encarte" / "Correnteza-Encarte.pdf", pasta / f'{encarte["album"]} - Encarte.pdf')
print(f"  {len(encarte['faixas'])} faixas + encarte em \"{pasta.name}\"")
PY
  (cd "$TMP/zip" && zip -0 -q -r -X "$TMP/album.zip" .)

  echo "Arquivos completos:"
  for f in "${faixas[@]}"; do enviar "full/$(basename "$f")" "$f" "audio/mpeg" "private, max-age=86400"; done
  enviar "full/encarte.pdf" "$PRIVADO/encarte/Correnteza-Encarte.pdf" "application/pdf" "private, max-age=86400"
  enviar "full/encarte.json" "$PRIVADO/encarte/encarte.json" "application/json; charset=utf-8" "no-cache"
  enviar "full/album.zip" "$TMP/album.zip" "application/zip" "private, max-age=86400"
}

case "$QUAL" in
  previews) enviar_previas ;;
  full) enviar_completos ;;
  tudo) enviar_previas; enviar_completos ;;
  *) echo "Uso: ./scripts/enviar-r2.sh previews|full|tudo [--local]"; exit 1 ;;
esac
echo "Pronto ($([ "$ONDE" = "--local" ] && echo "R2 local de testes" || echo "R2 da Cloudflare")). Mudanças no encarte podem levar até 5 minutos para aparecer."
