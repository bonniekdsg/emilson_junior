#!/usr/bin/env bash
# Gera img/*.avif e img/*.webp a partir dos PNGs originais do Figma (figma-src/).
#
# Cada recorte é exatamente a área visível no frame 1:3: as caixas do Figma
# mostram só parte da imagem (ex.: h=131.58%, top=0 → o terço de baixo fica
# escondido). Recortar aqui evita baixar pixels que nunca aparecem.
#
# Recorta com ffmpeg, não com sips: `sips --cropOffset` ignora o deslocamento
# e recorta pelo centro (foi isso que cortou a cabeça na foto do hero).
#
# Requer: ffmpeg, cwebp, sips (macOS). Uso: tools/build-images.sh
set -euo pipefail

cd "$(dirname "$0")/.."
SRC=figma-src
OUT=img
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# crop <origem> <nome> <x> <y> <largura> <altura> [filtro extra]
crop() {
  local vf="crop=$5:$6:$3:$4${7:+,$7}"
  ffmpeg -loglevel error -y -i "$SRC/$1" -vf "$vf" "$TMP/$2.png"
}

# encode <nome-recortado> <saída> <largura>
# AVIF exige largura e altura pares (o sips gera arquivo quebrado com ímpares).
encode() {
  local png="$TMP/$2.png"
  ffmpeg -loglevel error -y -i "$TMP/$1.png" \
    -vf "scale=$3:-2:flags=lanczos,crop=trunc(iw/2)*2:trunc(ih/2)*2" "$png"
  cwebp -quiet -q 80 -m 6 -alpha_q 90 -sharp_yuv "$png" -o "$OUT/$2.webp"
  sips -s format avif -s formatOptions 62 "$png" --out "$OUT/$2.avif" >/dev/null
  echo "$2  $(sips -g pixelWidth -g pixelHeight "$png" | awk '/pixel/{printf "%s ", $2}')"
}

#     origem                  nome                x    y    larg  alt
crop  hero-person.png         hero-person         0    0    1062  1126
crop  historia-person.png     historia-person     66   0    956   1040
crop  compromisso-person.png  compromisso-person  62   0    1000  1026
crop  balao-conversa.png      balao               144  127  1362  822
crop  green-bg.png            compromisso-bg      284  239  1364  588
# A seção de contato usa a mesma arte girada 180° (largura/altura negativas no Figma).
crop  green-bg.png            contato-bg          160  218  1304  648  "hflip,vflip"
cp "$SRC/hero-bg.png" "$TMP/hero-bg.png"
crop  cidade.png              cidade              0    0    472   720

encode hero-person         hero-person-1062        1062
encode hero-person         hero-person-640         640
encode historia-person     historia-person-868     868
encode historia-person     historia-person-480     480
encode compromisso-person  compromisso-person-1000 1000
encode compromisso-person  compromisso-person-600  600
encode balao               balao-876               876
encode hero-bg             hero-bg-1600            1600
encode hero-bg             hero-bg-800             800
encode compromisso-bg      compromisso-bg-1364     1364
encode compromisso-bg      compromisso-bg-800      800
encode contato-bg          contato-bg-1304         1304
encode contato-bg          contato-bg-800          800
encode cidade              cidade-472              472
