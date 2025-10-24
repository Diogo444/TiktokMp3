# TikTok MP3 - Monorepo

Application complète pour télécharger et convertir des vidéos TikTok en MP3.

## 📁 Structure du Projet

```
TiktokMp3/
├── packages/
│   ├── frontend/          # Application Vue.js
│   └── backend/           # API Node.js + Express
├── package.json           # Configuration du monorepo
└── pnpm-lock.yaml
```

## 🚀 Installation

Ce projet utilise **pnpm** avec les workspaces pour gérer le monorepo.

```bash
# Installer toutes les dépendances
pnpm install
```

## 🛠️ Développement

### Lancer tout le projet (frontend + backend)

```bash
pnpm dev
```

### Lancer uniquement le frontend

```bash
pnpm dev:frontend
```

Le frontend sera accessible sur http://localhost:5173

### Lancer uniquement le backend

```bash
pnpm dev:backend
```

Le backend sera accessible sur http://localhost:3000

## 📦 Build

### Build du frontend

```bash
pnpm build:frontend
```

### Build complet

```bash
pnpm build
```

## 📚 Documentation

- [Frontend README](./packages/frontend/)
- [Backend README](./packages/backend/README.md)

## 🔧 Technologies

### Frontend
- Vue 3
- Vite
- JavaScript

### Backend
- Node.js
- Express
- CORS
- dotenv

## 📝 Prérequis

- Node.js >= 18.0.0
- pnpm >= 8.0.0
