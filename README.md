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
- yt-dlp (requis pour l'extraction YouTube)

Note pnpm : certains environnements bloquent les scripts d'installation. Si `ffmpeg-static` est installé sans binaire, lancez `pnpm approve-builds` et autorisez `ffmpeg-static`, ou installez FFmpeg sur votre machine.

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

Aucun fichier `.env` n'est requis : la stack fonctionne directement avec les valeurs intégrées.

### Build et lancement

```bash
docker compose up --build
```

Puis ouvrez `http://localhost:8080`. Caddy sert le frontend et reverse-proxy l'API.

## Confidentialité et stockage

- L'application convertit/télécharge en streaming.
- Le backend ne conserve pas les fichiers MP3/MP4 téléchargés.
- Les liens de téléchargement backend sont générés à la volée.

### Problème YouTube "Sign in to confirm you’re not a bot"

Sur certaines IP (souvent VPS/datacenter), YouTube peut bloquer `yt-dlp` et demander une validation anti-bot.
Dans ce cas, placez vos cookies YouTube (format `cookies.txt` Netscape) dans `./secrets/youtube-cookies.txt`
(dossier ignoré par git), puis relancez les conteneurs.

## Documentation additionnelle

- [Frontend README](./packages/frontend/README.md)
- [Backend README](./packages/backend/README.md)
