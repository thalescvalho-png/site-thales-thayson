#!/bin/bash
# Grava a duração (em segundos) de cada faixa no encarte.json, no campo "duracao".
# Com ela, a barra do álbum inteiro (TV e controle no celular) aparece certa antes de o áudio carregar,
# e os links da fila do Chromecast vencem pouco depois do fim previsto de cada faixa.
#
# Uso (no Terminal, dentro da pasta backend), depois de trocar alguma faixa:
#     ./scripts/duracoes.sh
#     ./scripts/enviar-r2.sh full      # envia o encarte.json atualizado
set -euo pipefail

BACKEND="$(cd "$(dirname "$0")/.." && pwd)"
PRIVADO="${CORRENTEZA_PRIVADO:-$(cd "$BACKEND/../.." && pwd)/correnteza-privado}"
ENCARTE="$PRIVADO/encarte/encarte.json"

command -v ffprobe >/dev/null || { echo "Não encontrei o ffprobe. Instale com: brew install ffmpeg"; exit 1; }
[ -f "$ENCARTE" ] || { echo "Não encontrei $ENCARTE"; exit 1; }

python3 - "$ENCARTE" "$PRIVADO/faixas" <<'PY'
import json, subprocess, sys
from pathlib import Path
caminho, faixas = Path(sys.argv[1]), Path(sys.argv[2])
encarte = json.loads(caminho.read_text(encoding="utf-8"))
for f in encarte["faixas"]:
    mp3 = faixas / f'{f["id"]}.mp3'
    if not mp3.exists():
        sys.exit(f"Falta a faixa {mp3}")
    saida = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp3)],
                           capture_output=True, text=True, check=True).stdout.strip()
    f["duracao"] = round(float(saida), 2)
    m, s = divmod(int(f["duracao"]), 60)
    print(f'ok    {f["id"]:<26} {m}:{s:02d}')
caminho.write_text(json.dumps(encarte, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
total = int(sum(f["duracao"] for f in encarte["faixas"]))
print(f"Álbum: {total // 60}:{total % 60:02d}. Gravado em {caminho}")
PY
