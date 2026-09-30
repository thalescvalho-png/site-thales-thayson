#!/bin/bash
# Gera as prévias públicas (trechos curtos com fade) a partir das faixas completas.
#
# Uso (no Terminal, dentro da pasta backend):
#     ./scripts/gerar-previas.sh
#
# Lê    previas.txt                          (onde começa cada prévia)
#       correnteza-privado/faixas/*.mp3      (faixas completas)
# Grava correnteza-privado/previews/*.mp3    (prévias, MP3 128 kbps, sem capa nem tags)
#
# Precisa do ffmpeg (instalado com: brew install ffmpeg).
set -euo pipefail

BACKEND="$(cd "$(dirname "$0")/.." && pwd)"
PRIVADO="${CORRENTEZA_PRIVADO:-$(cd "$BACKEND/../.." && pwd)/correnteza-privado}"
CONFIG="$BACKEND/previas.txt"
FAIXAS="$PRIVADO/faixas"
SAIDA="$PRIVADO/previews"

command -v ffmpeg >/dev/null || { echo "Não encontrei o ffmpeg. Instale com: brew install ffmpeg"; exit 1; }
[ -f "$CONFIG" ] || { echo "Não encontrei $CONFIG"; exit 1; }
mkdir -p "$SAIDA"

# "1:05" -> 65 ; "45" -> 45 ; "0:45.5" -> 45.5
segundos() {
  awk -v t="$1" 'BEGIN { n = split(t, p, ":"); s = 0; for (i = 1; i <= n; i++) s = s * 60 + p[i]; print s }'
}

duracao=15; fade=1.5; padrao="0:45"; faixas=()
while read -r nome valor _resto; do
  case "$nome" in
    ""|\#*) continue ;;
    duracao) duracao="$valor" ;;
    fade) fade="$valor" ;;
    padrao) padrao="$valor" ;;
    *) faixas+=("$nome|${valor:-}") ;;
  esac
done < <(sed 's/#.*//' "$CONFIG")

erros=0
for item in "${faixas[@]}"; do
  nome="${item%%|*}"; inicio="${item#*|}"
  [ -z "$inicio" ] || [ "${inicio:0:1}" = "#" ] && inicio="$padrao"
  entrada="$FAIXAS/$nome.mp3"
  if [ ! -f "$entrada" ]; then
    echo "ERRO  $nome: não achei $entrada"; erros=$((erros + 1)); continue
  fi
  s_inicio=$(segundos "$inicio")
  total=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$entrada")
  if awk -v a="$s_inicio" -v d="$duracao" -v t="$total" 'BEGIN { exit !(a + d > t) }'; then
    echo "ERRO  $nome: começa em $inicio, mas a faixa só tem $(awk -v t="$total" 'BEGIN { printf "%d:%02d", t/60, t%60 }')"
    erros=$((erros + 1)); continue
  fi
  fim_fade=$(awk -v d="$duracao" -v f="$fade" 'BEGIN { print d - f }')
  ffmpeg -hide_banner -loglevel error -y \
    -ss "$s_inicio" -t "$duracao" -i "$entrada" -map 0:a:0 \
    -af "afade=t=in:st=0:d=$fade,afade=t=out:st=$fim_fade:d=$fade" \
    -c:a libmp3lame -b:a 128k -ar 44100 -map_metadata -1 \
    "$SAIDA/$nome.mp3"
  gerada=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SAIDA/$nome.mp3")
  printf "ok    %-24s início %-6s -> %.1f s\n" "$nome" "$inicio" "$gerada"
done

if [ "$erros" -gt 0 ]; then
  echo "$erros prévia(s) com problema. Corrija previas.txt e rode de novo."; exit 1
fi
echo "Prévias prontas em $SAIDA"
