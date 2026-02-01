# 🎬 Configuration YouTube pour TiktokMp3

YouTube a mis en place des mesures anti-bot strictes. Voici comment configurer le convertisseur pour contourner ces limitations.

## 📋 Deux options disponibles

### Option 1 : PO Token Provider (Automatique) ✅

Le `docker-compose.yml` inclut déjà le container `bgutil-ytdlp-pot-provider` qui génère automatiquement les tokens PO.

**Vérifiez que le container fonctionne :**
```bash
docker ps | grep pot-provider
docker logs tiktokmp3-pot-provider
```

Si le container est "healthy", le PO Token devrait fonctionner automatiquement.

---

### Option 2 : Cookies YouTube (Recommandé si Option 1 échoue) 🍪

Les cookies permettent de simuler une session de navigateur authentifiée.

#### Étape 1 : Installer l'extension navigateur

**Chrome / Brave / Edge :**
- [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)

**Firefox :**
- [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

⚠️ **N'utilisez PAS** l'extension "Get cookies.txt" (sans LOCALLY) - elle a été signalée comme malware.

#### Étape 2 : Exporter les cookies

1. **Connectez-vous à YouTube** avec votre compte Google
2. **Allez sur** https://www.youtube.com
3. **Cliquez sur l'extension** et choisissez "Export" ou "Download"
4. **Sauvegardez** le fichier `cookies.txt`

#### Étape 3 : Placer le fichier sur le serveur

```bash
# Sur votre VPS, dans le dossier du projet
mkdir -p secrets
nano secrets/youtube-cookies.txt
# Collez le contenu du fichier exporté
```

Ou utilisez SCP :
```bash
scp cookies.txt user@votre-vps:/chemin/vers/TiktokMp3/secrets/youtube-cookies.txt
```

#### Étape 4 : Vérifier le format

Le fichier doit commencer par :
```
# Netscape HTTP Cookie File
# ou
# HTTP Cookie File
```

Et contenir des lignes comme :
```
.youtube.com	TRUE	/	TRUE	1234567890	VISITOR_INFO1_LIVE	xxxxx
.youtube.com	TRUE	/	TRUE	1234567890	YSC	xxxxx
.youtube.com	TRUE	/	TRUE	1234567890	GPS	1
```

#### Étape 5 : Redémarrer les containers

```bash
docker compose down
docker compose up --build -d
docker logs -f tiktokmp3-backend
```

---

## 🔧 Configuration avancée

### Variables d'environnement

Dans votre fichier `.env` ou `docker-compose.yml` :

```env
# Chemin vers le fichier cookies (optionnel si placé dans /secrets/youtube-cookies.txt)
YTDLP_COOKIES_FILE=/run/secrets/youtube-cookies.txt

# URL du PO Token provider (déjà configuré)
POT_PROVIDER_URL=http://tiktokmp3-pot-provider:4416

# Timeout pour yt-dlp (en ms, augmentez si lent)
YTDLP_TIMEOUT_MS=60000
```

### Combiner les deux options

Pour une fiabilité maximale, utilisez **les deux** :
- Le PO Token provider en premier
- Les cookies en backup

Le code utilise automatiquement les deux s'ils sont configurés.

---

## 🐛 Dépannage

### Erreur "Sign in to confirm you're not a bot"

1. Vérifiez que le PO Token container fonctionne :
   ```bash
   docker logs tiktokmp3-pot-provider
   ```

2. Testez manuellement yt-dlp :
   ```bash
   docker exec -it tiktokmp3-backend sh
   yt-dlp -v --cookies /run/secrets/youtube-cookies.txt "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
   ```

### Erreur "HTTP 403 Forbidden"

- Les cookies ont peut-être expiré → Réexportez-les
- L'IP du serveur est bloquée → Attendez quelques heures ou utilisez un VPN

### Le PO Token ne fonctionne pas

Essayez de mettre à jour yt-dlp :
```bash
docker exec -it tiktokmp3-backend pip3 install -U yt-dlp bgutil-ytdlp-pot-provider
```

Puis redémarrez le container.

---

## 📊 Clients YouTube supportés

| Client | PO Token requis | Notes |
|--------|----------------|-------|
| `mweb` | GVS | ✅ Recommandé - stable |
| `web` | Subs, GVS | Peut nécessiter cookies |
| `tv` | Non | Peut avoir DRM |
| `android` | GVS ou Player | Pas de cookies |
| `ios` | GVS ou Player | Pas de cookies |

Le code utilise `mweb` par défaut quand le PO Token provider est configuré.

---

## 🔄 Renouvellement des cookies

Les cookies YouTube expirent généralement après **quelques jours à quelques semaines**.

**Signes d'expiration :**
- Erreurs 403 soudaines
- Messages "Sign in to confirm you're not a bot"

**Solution :** Réexportez les cookies et remplacez le fichier.

---

## ✅ Checklist finale

- [ ] Container `tiktokmp3-pot-provider` en fonctionnement
- [ ] Fichier `secrets/youtube-cookies.txt` créé (optionnel mais recommandé)
- [ ] Variables d'environnement correctes
- [ ] Containers redémarrés après configuration
- [ ] Test avec une vraie URL YouTube
