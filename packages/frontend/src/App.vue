<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';

const formUrl = ref('');
const statusMessage = ref('');
const statusTone = ref('idle'); // idle | loading | success | error
const isSubmitting = ref(false);
const isDownloading = ref(false);
const result = ref(null);
const audioObjectUrl = ref('');
const downloadError = ref('');

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:3000';

const IOS_USER_AGENT_MATCH =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 2);
const isIOS = ref(IOS_USER_AGENT_MATCH);

const resetStatus = () => {
  statusMessage.value = '';
  statusTone.value = 'idle';
  downloadError.value = '';
};

const revokeAudioUrl = () => {
  if (audioObjectUrl.value) {
    URL.revokeObjectURL(audioObjectUrl.value);
    audioObjectUrl.value = '';
  }
};

onBeforeUnmount(() => {
  revokeAudioUrl();
});

const toAbsoluteUrl = (pathOrUrl) => {
  try {
    return new URL(pathOrUrl, API_BASE_URL).toString();
  } catch (error) {
    return pathOrUrl;
  }
};

const hasUrlValue = computed(() => formUrl.value.trim().length > 0);
const submitDisabled = computed(() => !hasUrlValue.value || isSubmitting.value);

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

const validateUrl = (value) => {
  try {
    const candidate = new URL(value);
    return (
      ['https:', 'http:'].includes(candidate.protocol) &&
      candidate.hostname.includes('tiktok')
    );
  } catch (error) {
    return false;
  }
};

const handleSubmit = async () => {
  resetStatus();

  const trimmedUrl = formUrl.value.trim();
  if (!trimmedUrl) {
    statusMessage.value = 'Merci de coller un lien TikTok valide.';
    statusTone.value = 'error';
    return;
  }

  if (!validateUrl(trimmedUrl)) {
    statusMessage.value =
      "Le lien ne ressemble pas à une URL TikTok. Vérifiez qu'il commence par https://www.tiktok.com/ ...";
    statusTone.value = 'error';
    return;
  }

  isSubmitting.value = true;
  statusMessage.value = 'Conversion en cours, patientez quelques secondes…';
  statusTone.value = 'loading';
  downloadError.value = '';

  try {
    const response = await fetch(`${API_BASE_URL}/api/convert`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url: trimmedUrl }),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      const upstreamMessage =
        errorPayload?.error ||
        "Impossible d'obtenir l'audio pour cette vidéo pour le moment.";
      throw new Error(upstreamMessage);
    }

    const payload = await response.json();
    const audio = payload?.audio;

    if (!audio?.downloadPath) {
      throw new Error(
        "La réponse du serveur est incomplète. Réessayez dans quelques instants.",
      );
    }

    revokeAudioUrl();
    result.value = {
      title: audio.title,
      author: audio.author,
      cover: audio.cover,
      duration: audio.duration,
      fileName: audio.fileName || 'tiktok-audio.mp3',
      downloadUrl: toAbsoluteUrl(audio.downloadPath),
    };

    statusMessage.value =
      'Conversion réussie ! Vous pouvez maintenant télécharger votre MP3.';
    statusTone.value = 'success';
  } catch (error) {
    console.error('Conversion front error:', error);
    result.value = null;
    statusMessage.value =
      error?.message ||
      'Une erreur inattendue est survenue. Merci de réessayer.';
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

  try {
    const response = await fetch(result.value.downloadUrl);
    if (!response.ok) {
      throw new Error(
        'Impossible de récupérer le fichier audio. Tentez une nouvelle fois.',
      );
    }

    const blob = await response.blob();
    if (!blob || blob.size === 0) {
      throw new Error(
        "Le fichier reçu est vide. Réessayez dans quelques secondes.",
      );
    }

    revokeAudioUrl();
    const objectUrl = URL.createObjectURL(blob);
    audioObjectUrl.value = objectUrl;

    if (isIOS.value) {
      window.open(objectUrl, '_blank', 'noopener');
      statusMessage.value =
        'Le MP3 est prêt. Dans Safari, touchez le bouton partager puis “Enregistrer dans Fichiers”.';
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
      statusMessage.value = 'Le MP3 a été téléchargé avec succès.';
      statusTone.value = 'success';
    }
  } catch (error) {
    console.error('Download front error:', error);
    downloadError.value =
      error?.message ||
      'Le téléchargement a échoué. Vérifiez votre connexion et réessayez.';
    statusMessage.value = downloadError.value;
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
        <h1 class="panel__title">TikTok → MP3</h1>
        <p class="panel__subtitle">
          Collez n'importe quel lien TikTok public et obtenez un fichier audio
          prêt à être sauvegardé sur votre iPhone.
        </p>
      </header>

      <form class="panel__form" @submit.prevent="handleSubmit">
        <div class="field-group">
          <label class="field-group__label" for="tiktok-url">
            Adresse de la vidéo TikTok
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
              placeholder="https://www.tiktok.com/@username/video/..."
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
              <span>{{ isSubmitting ? 'Conversion…' : 'Convertir en MP3' }}</span>
            </button>
          </div>
          <p id="url-hint" class="field-group__hint">
            Astuce : ouvrez TikTok, touchez “Partager” puis “Copier le lien”.
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
                {{ isDownloading ? 'Préparation…' : 'Télécharger le MP3' }}
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

          <div v-if="audioObjectUrl" class="result-card__player">
            <audio
              :src="audioObjectUrl"
              controls
              preload="metadata"
              aria-label="Préécoute du MP3 TikTok converti"
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
