# TikTok MP3 Backend

Backend API pour le projet TikTok MP3.

## Installation

```bash
pnpm install
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

### POST /api/download
Télécharge une vidéo TikTok
- Body: `{ "url": "https://tiktok.com/..." }`
