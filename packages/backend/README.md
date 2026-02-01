# TikTok / YouTube MP3 Backend

Backend API pour le projet TikTok / YouTube MP3.

## Installation

```bash
pnpm install
```

## Prérequis (YouTube)

- FFmpeg (conversion YouTube → mp3/mp4)
- Option pnpm : si les scripts sont bloqués, lancez `pnpm approve-builds` et autorisez `ffmpeg-static`, ou installez FFmpeg et définissez `FFMPEG_PATH`.
- Conseil : `@distube/ytdl-core` peut casser quand YouTube change. Le backend peut utiliser `yt-dlp` si disponible via `YOUTUBE_PROVIDER=yt-dlp` (recommandé).

### Erreur YouTube "Sign in to confirm you’re not a bot"

Sur certaines IP (souvent VPS/datacenter), YouTube peut bloquer `yt-dlp` et demander une validation anti-bot.
Dans ce cas, configurez un fichier de cookies (format `cookies.txt` Netscape) et définissez :

```
YTDLP_COOKIES_FILE=/run/secrets/youtube-cookies.txt
```

## Configuration

Copiez le fichier `.env.example` en `.env` et configurez vos variables d'environnement :

```bash
cp .env.example .env
```

## Développement

```bash
pnpm dev
```

Le serveur sera accessible sur http://localhost:3000

## API Endpoints

### GET /
Retourne un message de bienvenue

### GET /api/health
Vérifie le statut de l'API

### POST /api/convert
Détecte automatiquement TikTok vs YouTube et retourne les métadonnées + un lien de téléchargement.
- Body: `{ "url": "https://www.tiktok.com/...", "format": "mp3" }`
- Body: `{ "url": "https://www.tiktok.com/...", "format": "mp4" }`
- Body: `{ "url": "https://www.youtube.com/watch?v=...", "format": "mp3" }`
- Body: `{ "url": "https://www.youtube.com/watch?v=...", "format": "mp4" }`

### GET /api/download?source=...&title=...
Télécharge l'audio (mp3) correspondant au `source` renvoyé par `/api/convert`.
