# YouTube / TikTok MP3-MP4 - Frontend

Application Vue 3 pour convertir des URLs YouTube ou TikTok en MP3/MP4.

## Installation

```bash
pnpm install
```

## Développement

```bash
pnpm dev
```

L'application sera accessible sur http://localhost:5173

## Build

```bash
pnpm build
```

## Preview

```bash
pnpm preview
```

## Technologies

- Vue 3 avec `<script setup>`
- Vite
- JavaScript ES6+

## Fonctionnalités UI

- Détection automatique de plateforme (YouTube/TikTok)
- Sélection MP3 ou MP4
- Affichage de l'état runtime backend (`/api/capabilities`)
- Préparation serveur + polling de job (`/api/jobs/:id`) avant téléchargement direct
- Fallback automatique vers le lien de streaming direct si la préparation échoue
