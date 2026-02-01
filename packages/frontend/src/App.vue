<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';

const formUrl = ref('');
const outputFormat = ref('mp3'); // mp3 | mp4
const statusMessage = ref('');
const statusTone = ref('idle'); // idle | loading | success | error
const isSubmitting = ref(false);
const isDownloading = ref(false);
const result = ref(null);
const mediaObjectUrl = ref('');
const downloadError = ref('');

const IOS_USER_AGENT_MATCH =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 2);
const isIOS = ref(IOS_USER_AGENT_MATCH);

const resetStatus = () => {
  statusMessage.value = '';
  statusTone.value = 'idle';
  downloadError.value = '';
};

// Messages d'erreur détaillés par type
const ERROR_MESSAGES = {
  network: 'Problème de connexion réseau. Vérifiez votre connexion internet et réessayez.',
  timeout: 'La requête a pris trop de temps. Le serveur est peut-être surchargé, réessayez dans quelques instants.',
  invalidUrl: 'Le lien fourni n\'est pas valide. Assurez-vous de copier l\'URL complète depuis TikTok ou YouTube.',
  serverError: 'Le serveur a rencontré un problème. Réessayez dans quelques secondes.',
  videoUnavailable: 'Cette vidéo n\'est pas accessible. Elle est peut-être privée ou supprimée.',
  default: 'Une erreur inattendue est survenue. Merci de réessayer.',
};

const getErrorMessage = (error, context = 'default') => {
  if (!error) return ERROR_MESSAGES.default;
  
  const message = error?.message?.toLowerCase() || '';
  
  if (message.includes('network') || message.includes('fetch')) {
    return ERROR_MESSAGES.network;
  }
  if (message.includes('timeout') || message.includes('abort')) {
    return ERROR_MESSAGES.timeout;
  }
  if (message.includes('private') || message.includes('unavailable') || message.includes('not found')) {
    return ERROR_MESSAGES.videoUnavailable;
  }
  
  // Retourner le message du serveur s'il existe, sinon le message par défaut
  return error?.message || ERROR_MESSAGES[context] || ERROR_MESSAGES.default;
};

const revokeAudioUrl = () => {
  if (mediaObjectUrl.value) {
    URL.revokeObjectURL(mediaObjectUrl.value);
    mediaObjectUrl.value = '';
  }
};

onBeforeUnmount(() => {
  revokeAudioUrl();
});

const toAbsoluteUrl = (pathOrUrl) => {
  try {
    if (!pathOrUrl) {
      return pathOrUrl;
    }
    const isAbsolute = /^https?:\/\//i.test(pathOrUrl);
    if (isAbsolute) {
      return pathOrUrl;
    }
    // En développement, on utilise les URLs relatives pour le proxy Vite
    // En production, on construit l'URL complète avec window.location.origin
    return new URL(pathOrUrl, window.location.origin).toString();
  } catch (error) {
    return pathOrUrl;
  }
};

const hasUrlValue = computed(() => formUrl.value.trim().length > 0);
const submitDisabled = computed(() => !hasUrlValue.value || isSubmitting.value);
const submitLabel = computed(() =>
  outputFormat.value === 'mp4' ? 'Convertir en MP4' : 'Convertir en MP3',
);

const statusClass = computed(() => ({
  'status-message': true,
  [`status-${statusTone.value}`]: Boolean(statusTone.value),
}));

const prettyDuration = computed(() => {
  if (!result.value?.duration) {
    return '';
  }
  const seconds = Number(result.value.duration);
  if (Number.isNaN(seconds)) {
    return '';
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}min ${remainingSeconds.toString().padStart(2, '0')}s`;
});

const detectPlatform = (value) => {
  try {
    const candidate = new URL(value);
    if (!['https:', 'http:'].includes(candidate.protocol)) {
      return null;
    }

    const host = candidate.hostname.toLowerCase();
    if (host.includes('tiktok')) {
      return 'tiktok';
    }
    if (
      host === 'youtu.be' ||
      host.endsWith('.youtu.be') ||
      host === 'youtube.com' ||
      host.endsWith('.youtube.com') ||
      host === 'music.youtube.com' ||
      host.endsWith('.music.youtube.com')
    ) {
      return 'youtube';
    }
    return null;
  } catch (error) {
    return null;
  }
};

const handleSubmit = async () => {
  resetStatus();

  const trimmedUrl = formUrl.value.trim();
  if (!trimmedUrl) {
    statusMessage.value = 'Merci de coller un lien TikTok ou YouTube valide.';
    statusTone.value = 'error';
    return;
  }

  const platform = detectPlatform(trimmedUrl);
  if (!platform) {
    statusMessage.value =
      "Le lien ne ressemble pas à une URL TikTok ou YouTube. Vérifiez qu'il commence par https://www.tiktok.com/ ou https://www.youtube.com/ ...";
    statusTone.value = 'error';
    return;
  }

  isSubmitting.value = true;
  const formatLabel = outputFormat.value === 'mp4' ? 'vidéo MP4' : 'audio MP3';
  const platformLabel = platform === 'youtube' ? 'YouTube' : 'TikTok';
  statusMessage.value = `⏳ Récupération de la ${formatLabel} depuis ${platformLabel}... Cela peut prendre quelques secondes.`;
  statusTone.value = 'loading';
  downloadError.value = '';

  try {
    const response = await fetch('/api/convert', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url: trimmedUrl, format: outputFormat.value }),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      const upstreamMessage =
        errorPayload?.error ||
        "Impossible d'obtenir l'audio pour cette vidéo pour le moment.";
      throw new Error(upstreamMessage);
    }

    const payload = await response.json();
    const audio = payload?.audio || payload?.media;

    if (!audio?.downloadPath) {
      throw new Error(
        "La réponse du serveur est incomplète. Réessayez dans quelques instants.",
      );
    }

    revokeAudioUrl();
    result.value = {
      format: audio.format || outputFormat.value || 'mp3',
      title: audio.title,
      author: audio.author,
      cover: audio.cover,
      duration: audio.duration,
      fileName:
        audio.fileName ||
        (outputFormat.value === 'mp4' ? 'media.mp4' : 'audio.mp3'),
      downloadUrl: toAbsoluteUrl(audio.downloadPath),
    };

    const successFormat = result.value.format === 'mp4' ? 'MP4' : 'MP3';
    const duration = prettyDuration.value ? ` (${prettyDuration.value})` : '';
    statusMessage.value = `✅ Conversion réussie ! Votre ${successFormat}${duration} est prêt à être téléchargé.`;
    statusTone.value = 'success';
  } catch (error) {
    console.error('Conversion front error:', error);
    result.value = null;
    statusMessage.value = `❌ ${getErrorMessage(error, 'serverError')}`;
    statusTone.value = 'error';
  } finally {
    isSubmitting.value = false;
  }
};

const downloadAudio = async () => {
  if (!result.value?.downloadUrl) {
    return;
  }

  isDownloading.value = true;
  downloadError.value = '';
  const formatLabel = result.value.format === 'mp4' ? 'MP4' : 'MP3';
  statusMessage.value = `⬇️ Téléchargement du ${formatLabel} en cours...`;
  statusTone.value = 'loading';

  try {
    const response = await fetch(result.value.downloadUrl);
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      const message =
        errorPayload?.error ||
        'Impossible de récupérer le fichier audio. Tentez une nouvelle fois.';
      throw new Error(
        message,
      );
    }

    const blob = await response.blob();
    if (!blob || blob.size === 0) {
      throw new Error(
        "Le fichier reçu est vide. Réessayez dans quelques secondes.",
      );
    }

    const isMp4 = result.value.format === 'mp4';
    const mimeType = isMp4 ? 'video/mp4' : 'audio/mpeg';

    // Forcer le type MIME pour éviter des extensions incorrectes côté navigateur
    const fileBlob = new Blob([blob], { type: mimeType });

    revokeAudioUrl();
    const objectUrl = URL.createObjectURL(fileBlob);
    mediaObjectUrl.value = objectUrl;

    if (isIOS.value) {
      window.open(objectUrl, '_blank', 'noopener');
      statusMessage.value = isMp4
        ? '✅ Le MP4 est prêt ! Dans Safari, touchez "Partager" → "Enregistrer dans Fichiers".'
        : '✅ Le MP3 est prêt ! Dans Safari, touchez "Partager" → "Enregistrer dans Fichiers".';
      statusTone.value = 'success';
    } else {
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = result.value.fileName;
      anchor.rel = 'noopener';
      anchor.style.setProperty('display', 'none');
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      const fileFormat = result.value.format === 'mp4' ? 'MP4' : 'MP3';
      statusMessage.value = `✅ ${fileFormat} téléchargé avec succès ! Vérifiez votre dossier de téléchargements.`;
      statusTone.value = 'success';
    }
  } catch (error) {
    console.error('Download front error:', error);
    const errorMsg = getErrorMessage(error, 'network');
    downloadError.value = errorMsg;
    statusMessage.value = `❌ ${errorMsg}`;
    statusTone.value = 'error';
  } finally {
    isDownloading.value = false;
  }
};
</script>

<template>
  <main class="layout">
    <section class="panel">
      <header class="panel__header">
        <h1 class="panel__title">TikTok / YouTube → MP3 / MP4</h1>
        <p class="panel__subtitle">
          Collez un lien TikTok ou YouTube public et obtenez un fichier audio
          ou vidéo prêt à être sauvegardé sur votre téléphone.
        </p>
      </header>

      <form class="panel__form" @submit.prevent="handleSubmit">
        <div class="field-group">
          <label class="field-group__label" for="tiktok-url">
            Adresse de la vidéo TikTok ou YouTube
          </label>
          <div class="field-group__controls">
            <input
              id="tiktok-url"
              v-model="formUrl"
              type="url"
              name="tiktok-url"
              required
              inputmode="url"
              autocomplete="url"
              spellcheck="false"
              placeholder="https://www.tiktok.com/@username/video/... ou https://www.youtube.com/watch?v=..."
              class="field-group__input"
              :aria-invalid="statusTone === 'error'"
              aria-describedby="url-hint"
            />
            <button
              class="primary-button"
              type="submit"
              :disabled="submitDisabled"
            >
              <span v-if="isSubmitting" class="spinner" aria-hidden="true" />
              <span>{{ isSubmitting ? 'Conversion…' : submitLabel }}</span>
            </button>
          </div>
          <div class="format-toggle" role="group" aria-label="Choisir le format">
            <button
              class="format-toggle__button"
              type="button"
              :aria-pressed="outputFormat === 'mp3'"
              :data-active="outputFormat === 'mp3'"
              @click="outputFormat = 'mp3'"
            >
              MP3 (audio)
            </button>
            <button
              class="format-toggle__button"
              type="button"
              :aria-pressed="outputFormat === 'mp4'"
              :data-active="outputFormat === 'mp4'"
              @click="outputFormat = 'mp4'"
            >
              MP4 (vidéo)
            </button>
          </div>
          <p id="url-hint" class="field-group__hint">
            Astuce : ouvrez TikTok/YouTube, touchez “Partager” puis “Copier le lien”.
          </p>
        </div>
      </form>

      <p v-if="statusMessage" :class="statusClass" aria-live="assertive">
        {{ statusMessage }}
      </p>

      <transition name="fade-scale">
        <section
          v-if="result"
          class="result-card"
          aria-live="polite"
          aria-atomic="true"
        >
          <div class="result-card__header">
            <img
              v-if="result.cover"
              :src="result.cover"
              class="result-card__cover"
              :alt="`Vignette de la vidéo ${result.title}`"
              loading="lazy"
              width="72"
              height="72"
            />
            <div class="result-card__meta">
              <h2 class="result-card__title">{{ result.title }}</h2>
              <p class="result-card__details">
                {{ result.author }}
                <span v-if="prettyDuration"> • {{ prettyDuration }}</span>
              </p>
            </div>
          </div>

          <div class="result-card__actions">
            <button
              class="primary-button"
              type="button"
              :disabled="isDownloading"
              @click="downloadAudio"
            >
              <span v-if="isDownloading" class="spinner" aria-hidden="true" />
              <span>
                {{
                  isDownloading
                    ? 'Préparation…'
                    : result?.format === 'mp4'
                      ? 'Télécharger le MP4'
                      : 'Télécharger le MP3'
                }}
              </span>
            </button>
            <a
              v-if="result.downloadUrl"
              class="secondary-button"
              :href="result.downloadUrl"
              target="_blank"
              rel="noopener"
            >
              Ouvrir dans un nouvel onglet
            </a>
          </div>

          <div v-if="mediaObjectUrl && result?.format === 'mp3'" class="result-card__player">
            <audio
              :src="mediaObjectUrl"
              controls
              preload="metadata"
              aria-label="Préécoute du MP3 converti"
            />
          </div>
          <div v-if="mediaObjectUrl && result?.format === 'mp4'" class="result-card__player">
            <video
              :src="mediaObjectUrl"
              controls
              preload="metadata"
              aria-label="Préécoute du MP4 converti"
            />
          </div>

          <details class="tips">
            <summary>Sauvegarder sur iPhone</summary>
            <ol class="tips__list">
              <li>
                Touchez “Télécharger le MP3”. Safari ouvre l'audio dans un
                nouvel onglet.
              </li>
              <li>
                Touchez le bouton partager, puis “Enregistrer dans Fichiers” ou
                “Enregistrer la vidéo”.
              </li>
              <li>
                Choisissez un dossier iCloud Drive pour retrouver votre musique.
              </li>
            </ol>
          </details>

          <p v-if="downloadError" class="status-message status-error">
            {{ downloadError }}
          </p>
        </section>
      </transition>
    </section>
  </main>
</template>
