#!/bin/bash
# Gera os cartões de link (img/og/*.jpg, 1200×630) a partir de scripts/cartao-de-link.html.
# Precisa do Google Chrome instalado e de internet (para as fontes). Rode da pasta do site:
#   ./scripts/gerar-cartoes-de-link.sh
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
MOLDE="file://$PWD/scripts/cartao-de-link.html"
SAIDA="img/og"
TEMP="$(mktemp -d)"
mkdir -p "$SAIDA"

foto() { # foto NOME "parâmetros"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1200,630 --virtual-time-budget=8000 \
    --screenshot="$TEMP/$1.png" "$MOLDE?$2" >/dev/null 2>&1
  sips -s format jpeg -s formatOptions 84 "$TEMP/$1.png" --out "$SAIDA/$1.jpg" >/dev/null
  echo "  $SAIDA/$1.jpg"
}
codificar() { python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$1"; }

echo "Gerando os cartões de link:"
foto correnteza "tipo=album"
foto links "tipo=links"
# número | endereço curto | título | cor da faixa | segunda cor (as mesmas do encarte)
while IFS='|' read -r numero slug titulo tom tom2; do
  foto "$slug" "tipo=faixa&numero=$numero&titulo=$(codificar "$titulo")&tom=$(codificar "$tom")&tom2=$(codificar "$tom2")"
done <<'FAIXAS'
1|clareira|Clareira|#A9C98A|#E3C77A
2|candeia|Candeia|#E8AE62|#C68B3E
3|no-leito|No Leito|#86BCD4|#3E7C9A
4|meandros|Meandros|#74B3AB|#2F6F73
5|correnteza-faixa|Correnteza|#B9CCDA|#C68B3E
6|a-danca-das-chamas|A Dança das Chamas|#EC8456|#B8452A
7|degredo|Degredo|#C48BB6|#6D4C7D
8|lugubre|Lúgubre|#9AA2DD|#3A3F7B
9|endless|Endless|#8FB3CF|#3E5C76
FAIXAS
rm -rf "$TEMP"
