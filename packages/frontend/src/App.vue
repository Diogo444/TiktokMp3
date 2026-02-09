<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { useApi } from './composables/useApi';

const { convert } = useApi();

const urlValue = ref('');
const outputFormat = ref('mp3');
const statusMessage = ref('');
const statusTone = ref('idle'); // idle | loading | success | warning | error
const isSubmitting = ref(false);
const isDownloading = ref(false);
const result = ref(null);
const previewObjectUrl = ref('');

const IOS_USER_AGENT_MATCH =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 2);
const isIOS = ref(IOS_USER_AGENT_MATCH);

const detectPlatform = (value = '') => {
  try {
    const candidate = new URL(value);
    if (!['http:', 'https:'].includes(candidate.protocol)) {
      return null;
    }

    const host = candidate.hostname.toLowerCase();
    if (host.includes('tiktok')) {
      return 'tiktok';
    }
    if (
      host === 'youtube.com' ||
      host.endsWith('.youtube.com') ||
      host === 'youtu.be' ||
      host.endsWith('.youtu.be') ||
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

const clearPreviewUrl = () => {
  if (previewObjectUrl.value) {
    URL.revokeObjectURL(previewObjectUrl.value);
    previewObjectUrl.value = '';
  }
};

onBeforeUnmount(() => {
  clearPreviewUrl();
});

const detectedPlatform = computed(() =>
  detectPlatform(urlValue.value.trim()),
);
const platformLabel = computed(() => {
  if (detectedPlatform.value === 'youtube') {
    return 'YouTube detecte';
  }
  if (detectedPlatform.value === 'tiktok') {
    return 'TikTok detecte';
  }
  if (urlValue.value.trim()) {
    return 'Lien non supporte';
  }
  return 'Detection auto active';
});

const hasUrl = computed(() => urlValue.value.trim().length > 0);
const submitDisabled = computed(
  () => !hasUrl.value || !detectedPlatform.value || isSubmitting.value,
);
const convertButtonLabel = computed(() =>
  outputFormat.value === 'mp4' ? 'Convertir en MP4' : 'Convertir en MP3',
);

const statusClass = computed(() => ({
  status: true,
  [`status--${statusTone.value}`]: statusTone.value !== 'idle',
}));

const prettyDuration = computed(() => {
  const rawValue = Number(result.value?.duration);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return '';
  }
  const hours = Math.floor(rawValue / 3600);
  const minutes = Math.floor((rawValue % 3600) / 60);
  const seconds = Math.floor(rawValue % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

const isMp4Result = computed(() => result.value?.format === 'mp4');

const setStatus = (tone, message) => {
  statusTone.value = tone;
  statusMessage.value = message;
};

const toAbsoluteUrl = (pathOrUrl) => {
  if (!pathOrUrl) {
    return '';
  }
  try {
    return new URL(pathOrUrl, window.location.origin).toString();
  } catch (error) {
    return pathOrUrl;
  }
};

const parseErrorResponse = async (response, fallbackMessage) => {
  const payload = await response.json().catch(() => null);
  return payload?.error || fallbackMessage;
};

watch([urlValue, outputFormat], () => {
  if (result.value) {
    result.value = null;
    clearPreviewUrl();
  }
});

const handleConvert = async () => {
  const trimmedUrl = urlValue.value.trim();

  if (!trimmedUrl) {
    setStatus('error', 'Collez un lien YouTube ou TikTok pour demarrer.');
    return;
  }

  if (!detectedPlatform.value) {
    setStatus(
      'error',
      'URL non reconnue. Utilisez un lien complet TikTok ou YouTube.',
    );
    return;
  }

  isSubmitting.value = true;
  clearPreviewUrl();
  setStatus('loading', 'Analyse du lien et preparation du telechargement...');

  try {
    const payload = await convert(trimmedUrl, outputFormat.value);
    const media = payload?.audio || payload?.media;

    if (!media?.downloadPath) {
      throw new Error('Reponse API incomplete. Reessayez.');
    }

    result.value = {
      platform: media.platform || detectedPlatform.value,
      format: media.format || outputFormat.value,
      title: media.title || 'Media',
      author: media.author || 'Createur',
      cover: media.cover || '',
      duration: media.duration,
      fileName:
        media.fileName ||
        `${media.platform || 'media'}-${Date.now()}.${
          outputFormat.value === 'mp4' ? 'mp4' : 'mp3'
        }`,
      downloadUrl: toAbsoluteUrl(media.downloadPath),
    };

    const readyFormat = result.value.format === 'mp4' ? 'MP4' : 'MP3';
    setStatus('success', `${readyFormat} pret. Telechargez le fichier localement.`);
  } catch (error) {
    setStatus('error', error?.message || 'La conversion a echoue.');
    result.value = null;
  } finally {
    isSubmitting.value = false;
  }
};

const handleDownload = async () => {
  if (!result.value?.downloadUrl) {
    return;
  }

  isDownloading.value = true;
  setStatus('loading', 'Telechargement en cours...');

  try {
    const response = await fetch(result.value.downloadUrl, {
      cache: 'no-store',
    });
    if (!response.ok) {
      const message = await parseErrorResponse(
        response,
        'Impossible de telecharger le fichier.',
      );
      throw new Error(message);
    }

    const blob = await response.blob();
    if (!blob || blob.size === 0) {
      throw new Error('Le fichier recu est vide.');
    }

    const mimeType = result.value.format === 'mp4' ? 'video/mp4' : 'audio/mpeg';
    const downloadBlob = new Blob([blob], { type: mimeType });
    clearPreviewUrl();
    const objectUrl = URL.createObjectURL(downloadBlob);
    previewObjectUrl.value = objectUrl;

    if (isIOS.value) {
      window.open(objectUrl, '_blank', 'noopener');
      setStatus(
        'success',
        'Fichier ouvert. Utilisez Partager puis Enregistrer dans Fichiers.',
      );
      return;
    }

    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = result.value.fileName;
    anchor.rel = 'noopener';
    anchor.style.setProperty('display', 'none');
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    const formatLabel = result.value.format === 'mp4' ? 'MP4' : 'MP3';
    setStatus('success', `${formatLabel} telecharge.`);
  } catch (error) {
    setStatus('error', error?.message || 'Le telechargement a echoue.');
  } finally {
    isDownloading.value = false;
  }
};
</script>

<template>
  <main class="app-shell">
    <section class="converter card card--main">
      <header class="converter__header">
        <p class="eyebrow">YouTube + TikTok Converter</p>
        <h1>Convertisseur MP3 / MP4</h1>
        <p>
          Collez une URL YouTube ou TikTok. La plateforme est detectee
          automatiquement, puis le fichier est telecharge directement dans votre
          navigateur.
        </p>
      </header>

      <form class="converter__form" @submit.prevent="handleConvert">
        <label for="video-url">URL de la video</label>
        <input
          id="video-url"
          v-model="urlValue"
          type="url"
          autocomplete="url"
          spellcheck="false"
          inputmode="url"
          placeholder="https://www.youtube.com/watch?v=... ou https://www.tiktok.com/@.../video/..."
          :aria-invalid="statusTone === 'error'"
          required
        />

        <div class="chips" aria-live="polite">
          <span class="chip" :data-platform="detectedPlatform || 'unknown'">
            {{ platformLabel }}
          </span>
          <span class="chip chip--neutral">Aucun media conserve cote serveur</span>
        </div>

        <div class="format-picker" role="group" aria-label="Format de sortie">
          <button
            type="button"
            class="format-picker__button"
            :data-active="outputFormat === 'mp3'"
            :aria-pressed="outputFormat === 'mp3'"
            @click="outputFormat = 'mp3'"
          >
            MP3
          </button>
          <button
            type="button"
            class="format-picker__button"
            :data-active="outputFormat === 'mp4'"
            :aria-pressed="outputFormat === 'mp4'"
            @click="outputFormat = 'mp4'"
          >
            MP4
          </button>
        </div>

        <button class="btn btn--primary" type="submit" :disabled="submitDisabled">
          <span v-if="isSubmitting" class="spinner" aria-hidden="true" />
          <span>{{ isSubmitting ? 'Conversion...' : convertButtonLabel }}</span>
        </button>
      </form>

      <p v-if="statusMessage" :class="statusClass" aria-live="polite">
        {{ statusMessage }}
      </p>

      <transition name="reveal">
        <article v-if="result" class="result card" aria-live="polite">
          <header class="result__header">
            <img
              v-if="result.cover"
              class="result__cover"
              :src="result.cover"
              :alt="`Miniature ${result.title}`"
              width="88"
              height="88"
              loading="lazy"
            />
            <div>
              <p class="result__platform">
                {{ result.platform === 'youtube' ? 'YouTube' : 'TikTok' }}
              </p>
              <h2>{{ result.title }}</h2>
              <p>
                {{ result.author }}
                <span v-if="prettyDuration"> • {{ prettyDuration }}</span>
              </p>
            </div>
          </header>

          <div class="result__actions">
            <button class="btn btn--primary" :disabled="isDownloading" @click="handleDownload">
              <span v-if="isDownloading" class="spinner" aria-hidden="true" />
              <span>
                {{
                  isDownloading
                    ? 'Preparation...'
                    : result.format === 'mp4'
                      ? 'Telecharger MP4'
                      : 'Telecharger MP3'
                }}
              </span>
            </button>
            <a class="btn btn--ghost" :href="result.downloadUrl" rel="noopener" target="_blank">
              Ouvrir le flux direct
            </a>
          </div>

          <div v-if="previewObjectUrl" class="preview">
            <video v-if="isMp4Result" :src="previewObjectUrl" controls preload="metadata" />
            <audio v-else :src="previewObjectUrl" controls preload="metadata" />
          </div>
        </article>
      </transition>
    </section>

    <aside class="card card--side">
      <h2>Transparence</h2>
      <p>
        Le serveur agit comme un relais de conversion en streaming. Les fichiers
        MP3/MP4 ne sont pas ecrits sur disque.
      </p>
    </aside>
  </main>
</template>
