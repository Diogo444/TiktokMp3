<script setup>
import { computed, ref, watch } from 'vue';

import { useApi } from './composables/useApi';

const { convert, getJobStatus } = useApi();

const urlValue = ref('');
const outputFormat = ref('mp3');
const statusMessage = ref('');
const statusTone = ref('idle'); // idle | loading | success | warning | error
const isSubmitting = ref(false);
const isDownloading = ref(false);
const result = ref(null);

const IOS_USER_AGENT_MATCH =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 2);
const isIOS = ref(IOS_USER_AGENT_MATCH);
const isAndroid = ref(/Android/i.test(navigator.userAgent));
const isInAppBrowser = ref(
  /(FBAN|FBAV|Instagram|Line|MicroMessenger|TikTok|Twitter|Snapchat|; wv\)|\bwv\b)/i.test(
    navigator.userAgent,
  ),
);
const shouldUseDirectNavigation = computed(
  () => isInAppBrowser.value || isIOS.value,
);
const PREPARED_POLL_INTERVAL_MS = 1500;
const PREPARED_POLL_TIMEOUT_MS = 3 * 60 * 1000;

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

const compatibilityHint = computed(() => {
  if (isInAppBrowser.value) {
    return 'Le navigateur integre de certaines apps peut bloquer le telechargement. Ouvrez la page dans Safari/Chrome si besoin.';
  }
  if (isIOS.value) {
    return 'iPhone/iPad: lancez le telechargement et gardez Safari au premier plan pendant le demarrage. Le fichier sera ensuite dans Fichiers > Telechargements.';
  }
  if (isAndroid.value) {
    return 'Android: le fichier apparait dans Telechargements (ou dans le gestionnaire de fichiers).';
  }
  return '';
});

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

const openDirectInCurrentTab = (url) => {
  window.location.assign(url);
};

const triggerNativeDownload = (url, fileName = '') => {
  const anchor = document.createElement('a');
  anchor.href = url;
  if (fileName) {
    anchor.download = fileName;
  }
  anchor.rel = 'noopener';
  anchor.target = '_self';
  anchor.style.setProperty('display', 'none');
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const resolvePreparedDownload = async (prepared, fallbackUrl = '') => {
  if (!prepared?.jobId) {
    return {
      usedPrepared: false,
      timedOut: false,
      downloadUrl: fallbackUrl,
      fileName: '',
    };
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < PREPARED_POLL_TIMEOUT_MS) {
    const payload = await getJobStatus(prepared.jobId);
    if (payload?.status === 'ready' && payload?.downloadPath) {
      return {
        usedPrepared: true,
        timedOut: false,
        downloadUrl: toAbsoluteUrl(payload.downloadPath),
        fileName: payload.fileName || '',
      };
    }
    if (payload?.status === 'error') {
      throw new Error(payload?.error || 'La preparation du fichier a echoue.');
    }
    await sleep(PREPARED_POLL_INTERVAL_MS);
  }

  return {
    usedPrepared: false,
    timedOut: true,
    downloadUrl: fallbackUrl,
    fileName: '',
  };
};

watch([urlValue, outputFormat], () => {
  if (result.value) {
    result.value = null;
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
  setStatus('loading', 'Analyse du lien et preparation du telechargement...');

  try {
    const payload = await convert(trimmedUrl, outputFormat.value);
    const media = payload?.audio || payload?.media;

    if (!media?.downloadPath && !media?.prepared?.jobId) {
      throw new Error('Reponse API incomplete. Reessayez.');
    }

    const readyFormat = (media.format || outputFormat.value) === 'mp4' ? 'MP4' : 'MP3';
    const fallbackDownloadUrl = toAbsoluteUrl(media.downloadPath);
    let resolvedDownloadUrl = fallbackDownloadUrl;
    let resolvedFileName =
      media.fileName ||
      `${media.platform || 'media'}-${Date.now()}.${
        outputFormat.value === 'mp4' ? 'mp4' : 'mp3'
      }`;
    let finalTone = 'success';
    let finalMessage = `${readyFormat} pret. Telechargez le fichier localement.`;

    if (media?.prepared?.jobId) {
      setStatus('loading', 'Conversion terminee. Finalisation du fichier sur le serveur...');
      try {
        const preparedResult = await resolvePreparedDownload(
          media.prepared,
          fallbackDownloadUrl,
        );
        if (preparedResult.downloadUrl) {
          resolvedDownloadUrl = preparedResult.downloadUrl;
        }
        if (preparedResult.fileName) {
          resolvedFileName = preparedResult.fileName;
        }

        if (preparedResult.usedPrepared) {
          finalTone = 'success';
          finalMessage = `${readyFormat} pret (fichier prepare sur le serveur).`;
        } else if (preparedResult.timedOut && fallbackDownloadUrl) {
          finalTone = 'warning';
          finalMessage =
            'Preparation serveur en cours trop longtemps. Mode direct active en secours.';
        }
      } catch (error) {
        if (!fallbackDownloadUrl) {
          throw error;
        }
        finalTone = 'warning';
        finalMessage =
          'Preparation serveur indisponible. Mode direct active en secours.';
      }
    }

    if (!resolvedDownloadUrl) {
      throw new Error('Aucun lien de telechargement disponible.');
    }

    result.value = {
      platform: media.platform || detectedPlatform.value,
      format: media.format || outputFormat.value,
      title: media.title || 'Media',
      author: media.author || 'Createur',
      cover: media.cover || '',
      duration: media.duration,
      fileName: resolvedFileName,
      downloadUrl: resolvedDownloadUrl,
    };

    setStatus(finalTone, finalMessage);
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
  setStatus('loading', 'Lancement du telechargement...');

  try {
    if (shouldUseDirectNavigation.value) {
      openDirectInCurrentTab(result.value.downloadUrl);
      setStatus(
        'warning',
        compatibilityHint.value || 'Ouverture du lien direct.',
      );
      return;
    }

    triggerNativeDownload(result.value.downloadUrl, result.value.fileName);
    const formatLabel = result.value.format === 'mp4' ? 'MP4' : 'MP3';
    setStatus('success', `${formatLabel} telechargement lance.`);
  } catch (error) {
    try {
      openDirectInCurrentTab(result.value.downloadUrl);
      setStatus(
        'warning',
        'Mode direct active. Si rien ne se passe, ouvrez le lien dans Safari/Chrome.',
      );
    } catch {
      setStatus('error', error?.message || 'Le telechargement a echoue.');
    }
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
      <p v-if="compatibilityHint" class="status status--warning" aria-live="polite">
        {{ compatibilityHint }}
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
            <a
              class="btn btn--ghost"
              :href="result.downloadUrl"
              :download="shouldUseDirectNavigation ? null : result.fileName"
              rel="noopener"
              target="_self"
            >
              Lien direct (iPhone/compatibilite)
            </a>
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
