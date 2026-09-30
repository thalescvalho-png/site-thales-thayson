#!/bin/bash
# Corrige as informações internas (tags ID3) das faixas completas que vão para a venda:
# título, artista, álbum, número da faixa, ano e capa. O áudio é copiado bit a bit
# (não é recomprimido). Mexe só nas cópias em correnteza-privado/faixas.
#
# Uso (no Terminal, dentro da pasta backend):
#     ./scripts/preparar-faixas.sh
#
# Os títulos vêm de correnteza-privado/encarte/encarte.json; a capa, de encarte/capa.jpg.
set -euo pipefail

ARTISTA="Thales Carvalho & Thayson Azevedo"
ALBUM="Correnteza"
ANO="2026"

BACKEND="$(cd "$(dirname "$0")/.." && pwd)"
PRIVADO="${CORRENTEZA_PRIVADO:-$(cd "$BACKEND/../.." && pwd)/correnteza-privado}"
FAIXAS="$PRIVADO/faixas"
ENCARTE="$PRIVADO/encarte/encarte.json"
CAPA="$PRIVADO/encarte/capa.jpg"

command -v ffmpeg >/dev/null || { echo "Não encontrei o ffmpeg. Instale com: brew install ffmpeg"; exit 1; }
[ -f "$ENCARTE" ] || { echo "Não encontrei $ENCARTE"; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
# capa menor (1000 px) para não pesar em cada MP3
sips -Z 1000 -s format jpeg -s formatOptions 85 "$CAPA" --out "$TMP/capa.jpg" >/dev/null

# id | número | total | título   (lidos do encarte.json)
python3 - "$ENCARTE" > "$TMP/faixas.txt" <<'PY'
import json, sys
faixas = json.load(open(sys.argv[1], encoding="utf-8"))["faixas"]
for f in faixas:
    print(f'{f["id"]}|{f["numero"]}|{len(faixas)}|{f["titulo"]}')
PY

while IFS='|' read -r id numero total titulo; do
  arquivo="$FAIXAS/$id.mp3"
  if [ ! -f "$arquivo" ]; then echo "ERRO  não achei $arquivo"; exit 1; fi
  ffmpeg -hide_banner -loglevel error -y -i "$arquivo" -i "$TMP/capa.jpg" \
    -map 0:a:0 -map 1:0 -c copy -map_metadata -1 -id3v2_version 3 -write_id3v1 1 \
    -metadata title="$titulo" -metadata artist="$ARTISTA" -metadata album_artist="$ARTISTA" \
    -metadata album="$ALBUM" -metadata track="$numero/$total" -metadata date="$ANO" \
    -metadata:s:v title="Album cover" -metadata:s:v comment="Cover (front)" -disposition:v attached_pic \
    "$TMP/$id.mp3" < /dev/null
  mv "$TMP/$id.mp3" "$arquivo"
  printf "ok    %-26s %s/%s  %s\n" "$id.mp3" "$numero" "$total" "$titulo"
done < "$TMP/faixas.txt"
echo "Tags corrigidas em $FAIXAS"
