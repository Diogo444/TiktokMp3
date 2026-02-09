# Configuration YouTube

Le backend fonctionne sans `.env` et utilise `yt-dlp` + `ffmpeg` directement.

## Pré-requis

- `yt-dlp` disponible dans le PATH
- `ffmpeg` disponible dans le PATH

## Si YouTube bloque (anti-bot)

Ajoutez un fichier de cookies YouTube:

1. Exportez un `cookies.txt` (format Netscape) depuis votre navigateur connecté à YouTube.
2. Placez-le dans `secrets/youtube-cookies.txt`.
3. Redémarrez le backend (ou `docker compose up --build -d`).

Le backend lit automatiquement ce fichier à l'emplacement `/run/secrets/youtube-cookies.txt` en Docker.
