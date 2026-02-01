import { ref } from 'vue';

// Configuration des timeouts et retries
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

// Messages d'erreur localisés
const ERROR_MESSAGES = {
  network: 'Problème de connexion réseau. Vérifiez votre connexion internet.',
  timeout: 'La requête a pris trop de temps. Réessayez dans quelques instants.',
  server: 'Le serveur a rencontré un problème. Réessayez plus tard.',
  unknown: 'Une erreur inattendue est survenue.',
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseErrorMessage = (error, response) => {
  if (error?.name === 'AbortError') {
    return ERROR_MESSAGES.timeout;
  }
  if (error?.message?.includes('fetch') || error?.message?.includes('network')) {
    return ERROR_MESSAGES.network;
  }
  if (response?.status >= 500) {
    return ERROR_MESSAGES.server;
  }
  return error?.message || ERROR_MESSAGES.unknown;
};

export function useApi() {
  const loading = ref(false);
  const error = ref(null);
  const retryCount = ref(0);

  const apiCall = async (endpoint, options = {}) => {
    loading.value = true;
    error.value = null;
    retryCount.value = 0;

    const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = options.retries ?? MAX_RETRIES;

    const executeRequest = async (attempt = 0) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`/api${endpoint}`, {
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          const errorMessage = errorData?.error || `Erreur HTTP ${response.status}`;
          throw new Error(errorMessage);
        }

        const data = await response.json();
        return data;
      } catch (err) {
        clearTimeout(timeoutId);
        
        // Retry logic pour les erreurs réseau ou timeout
        const isRetryable = err.name === 'AbortError' || 
          err.message?.includes('fetch') || 
          err.message?.includes('network');
        
        if (isRetryable && attempt < maxRetries) {
          retryCount.value = attempt + 1;
          await delay(RETRY_DELAY_MS * (attempt + 1));
          return executeRequest(attempt + 1);
        }
        
        throw err;
      }
    };

    try {
      return await executeRequest();
    } catch (err) {
      error.value = parseErrorMessage(err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const downloadVideo = async (url) => {
    return apiCall('/download', {
      method: 'POST',
      body: JSON.stringify({ url }),
      timeout: 60000, // Plus long pour les téléchargements
    });
  };

  const checkHealth = async () => {
    return apiCall('/health', {
      timeout: 5000,
      retries: 1,
    });
  };

  const convert = async (url, format = 'mp3') => {
    return apiCall('/convert', {
      method: 'POST',
      body: JSON.stringify({ url, format }),
      timeout: 45000,
    });
  };

  return {
    loading,
    error,
    retryCount,
    downloadVideo,
    checkHealth,
    convert,
    apiCall,
  };
}
