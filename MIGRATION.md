# Guide de Migration vers Monorepo

## ✅ Migration Terminée

Votre projet TikTok MP3 a été transformé avec succès en monorepo !

## 📁 Nouvelle Structure

```
TiktokMp3/
├── packages/
│   ├── frontend/                    # Application Vue.js
│   │   ├── src/
│   │   │   ├── App.vue
│   │   │   ├── main.js
│   │   │   ├── style.css
│   │   │   ├── assets/
│   │   │   ├── components/
│   │   │   └── composables/
│   │   │       └── useApi.js       # Helper pour communiquer avec l'API
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.js          # Config avec proxy vers le backend
│   │   ├── package.json
│   │   └── README.md
│   │
│   └── backend/                     # API Node.js + Express
│       ├── src/
│       │   └── server.js           # Serveur Express
│       ├── .env                     # Variables d'environnement
│       ├── .env.example
│       ├── .gitignore
│       ├── package.json
│       └── README.md
│
├── node_modules/                    # Dépendances partagées (hoisted)
├── package.json                     # Configuration du monorepo
├── pnpm-workspace.yaml              # Configuration pnpm workspace
├── pnpm-lock.yaml
├── .gitignore
├── README.md
├── start.bat                        # Lance frontend + backend
├── start-frontend.bat               # Lance uniquement le frontend
└── start-backend.bat                # Lance uniquement le backend
```

## 🚀 Comment utiliser le monorepo

### Installation initiale

```bash
pnpm install
```

Cette commande installera toutes les dépendances pour le frontend ET le backend.

### Lancer tout le projet

**Option 1 : Utiliser le script batch (Windows)**
```bash
start.bat
```

**Option 2 : Utiliser pnpm directement**
```bash
pnpm dev
```

Cela lancera :
- Frontend sur http://localhost:5173
- Backend sur http://localhost:3000

### Lancer seulement le frontend

**Option 1 : Script batch**
```bash
start-frontend.bat
```

**Option 2 : pnpm**
```bash
pnpm dev:frontend
```

### Lancer seulement le backend

**Option 1 : Script batch**
```bash
start-backend.bat
```

**Option 2 : pnpm**
```bash
pnpm dev:backend
```

## 🔄 Communication Frontend ↔️ Backend

### Proxy Vite configuré

Le fichier `packages/frontend/vite.config.js` est configuré avec un proxy :

```javascript
proxy: {
  '/api': {
    target: 'http://localhost:3000',
    changeOrigin: true,
  }
}
```

Cela signifie que toutes les requêtes vers `/api/*` depuis le frontend seront automatiquement redirigées vers le backend.

### Exemple d'utilisation

Dans vos composants Vue, utilisez le composable `useApi` :

```javascript
import { useApi } from '@/composables/useApi';

const { downloadVideo, loading, error } = useApi();

// Appeler l'API
const handleDownload = async () => {
  try {
    const result = await downloadVideo('https://tiktok.com/...');
    console.log(result);
  } catch (err) {
    console.error('Erreur:', err);
  }
};
```

## 🛠️ API Backend Disponible

### GET /
Message de bienvenue

### GET /api/health
Vérifie le statut de l'API

**Réponse:**
```json
{
  "status": "OK",
  "timestamp": "2025-10-24T..."
}
```

### POST /api/download
Télécharge une vidéo TikTok

**Body:**
```json
{
  "url": "https://tiktok.com/..."
}
```

**Réponse:**
```json
{
  "success": true,
  "message": "Download endpoint ready",
  "url": "https://tiktok.com/..."
}
```

## 📦 Commandes pnpm utiles

```bash
# Installer une dépendance dans le frontend
pnpm --filter @tiktokmp3/frontend add <package>

# Installer une dépendance dans le backend
pnpm --filter @tiktokmp3/backend add <package>

# Installer une dépendance dev dans le frontend
pnpm --filter @tiktokmp3/frontend add -D <package>

# Exécuter une commande dans tous les packages
pnpm -r <command>

# Build du frontend
pnpm build:frontend

# Build de tout
pnpm build
```

## ✨ Avantages du Monorepo

1. **Code partagé facilement** : Possibilité de créer des packages communs
2. **Gestion unifiée** : Une seule installation pour tout le projet
3. **Développement synchronisé** : Frontend et backend en même temps
4. **Versioning cohérent** : Même version pour frontend et backend
5. **CI/CD simplifié** : Un seul repository à déployer

## 🔜 Prochaines étapes suggérées

1. **Implémenter la logique de téléchargement TikTok** dans `packages/backend/src/server.js`
2. **Créer l'interface utilisateur** dans `packages/frontend/src/`
3. **Ajouter la validation** avec des libraries comme `joi` ou `zod` côté backend
4. **Ajouter des tests** avec Vitest (frontend) et Jest (backend)
5. **Configuration Docker** pour le déploiement
6. **Package commun** : Créer `packages/shared` pour les types TypeScript partagés

## 📝 Notes importantes

- Le backend utilise le mode `--watch` de Node.js (nécessite Node.js 18+)
- Les variables d'environnement sont dans `packages/backend/.env`
- Le frontend communique avec le backend via le proxy Vite configuré
- En production, vous devrez configurer CORS et les URLs correctement

## 🐛 Dépannage

### Le backend ne démarre pas
- Vérifiez que le port 3000 est libre
- Vérifiez les dépendances : `pnpm install`

### Le frontend ne se connecte pas au backend
- Assurez-vous que le backend est démarré
- Vérifiez le proxy dans `vite.config.js`
- Vérifiez les CORS dans le backend

### Erreurs de dépendances
- Supprimez `node_modules` et relancez `pnpm install`
- Vérifiez que vous utilisez pnpm (pas npm ou yarn)
