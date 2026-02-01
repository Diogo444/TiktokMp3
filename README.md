# TikTok / YouTube MP3 - Monorepo

Application web pour convertir rapidement une vidéo TikTok ou YouTube publique en MP3 (audio) ou MP4 (vidéo) et la télécharger.

## Structure du projet

```
TiktokMp3/
├─ packages/
│  ├─ frontend/   # Application Vue 3 (Vite)
│  └─ backend/    # API Node.js + Express
├─ docker-compose.yml
├─ pnpm-lock.yaml
└─ pnpm-workspace.yaml
```

## Prerequis

- Node.js >= 18
- pnpm >= 8
- FFmpeg (requis pour la conversion YouTube → MP3/MP4)

Note pnpm : certains environnements bloquent les scripts d'installation. Si `ffmpeg-static` est installé sans binaire, lancez `pnpm approve-builds` et autorisez `ffmpeg-static`, ou installez FFmpeg sur votre machine et définissez `FFMPEG_PATH`.

## Installation locale

```bash
pnpm install
```

## Scripts de developpement

- Lancer les deux services : `pnpm dev`
- Frontend uniquement : `pnpm dev:frontend` (http://localhost:5173)
- Backend uniquement : `pnpm dev:backend` (http://localhost:3000)

## Build

- Frontend : `pnpm build:frontend`
- Tous les packages : `pnpm build`

## Deploiement Docker

Trois services sont fournis :
- `tiktokmp3-backend` : serveur Express (TikTok/YouTube) qui streame l'audio/vidéo.
- `tiktokmp3-frontend` : build Vite puis diffusion statique via Nginx.
- `tiktokmp3-caddy` : reverse proxy (sert le frontend et route `/api/*` vers le backend).

### Preparation

Optionnel : definir un fichier `.env` a la racine pour surcharger les variables (valeurs par defaut ci-dessous) :

```
PORT=3000
FRONTEND_ORIGIN=http://localhost:8080
VITE_API_BASE_URL=http://localhost:8080
TIKTOK_METADATA_ENDPOINT=https://www.tikwm.com/api/
API_TIMEOUT_MS=15000
AUDIO_TIMEOUT_MS=30000
FFMPEG_PATH=
YOUTUBE_AUDIO_BITRATE=192k
YOUTUBE_PROVIDER=yt-dlp
YTDLP_TIMEOUT_MS=45000
```

### Build et lancement

```bash
docker compose up --build
```

Puis ouvrez `http://localhost:8080`. Caddy sert le frontend et reverse-proxy l'API.

## Documentation additionnelle

- [Frontend README](./packages/frontend/README.md)
- [Backend README](./packages/backend/README.md)
