# TikTok MP3 - Monorepo

Application web pour convertir rapidement une video TikTok publique en MP3 et la telecharger depuis un iPhone.

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

Deux images sont fournies :
- `packages/backend/Dockerfile` : serveur Express qui interroge TikTok et streame l'audio.
- `packages/frontend/Dockerfile` : build Vite puis diffusion statique via Nginx.

Le `docker-compose.yml` assemble ces images et suppose un reseau externe `caddy_net` (utile pour Caddy ou un reverse proxy).

### Preparation

```bash
# creer le reseau une seule fois (si besoin)
docker network create caddy_net
```

Optionnel : definir un fichier `.env` a la racine pour surcharger les variables (valeurs par defaut ci-dessous) :

```
PORT=3000
FRONTEND_ORIGIN=http://frontend.localhost
VITE_API_BASE_URL=http://backend:3000
TIKTOK_METADATA_ENDPOINT=https://www.tikwm.com/api/
API_TIMEOUT_MS=15000
AUDIO_TIMEOUT_MS=30000
```

### Build et lancement

```bash
docker compose up --build
```

Les services ne publient pas de ports directement. Assurez-vous que votre reverse proxy sur `caddy_net` redirige vers :
- `backend:3000` pour l'API
- `frontend:80` pour l'interface web (servie par Nginx)

Le build frontend injecte l'URL de l'API via l'argument `VITE_API_BASE_URL`. Ajustez-le si l'API est exposee sur une adresse differente.

## Documentation additionnelle

- [Frontend README](./packages/frontend/README.md)
- [Backend README](./packages/backend/README.md)
