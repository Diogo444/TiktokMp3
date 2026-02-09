import { ref } from 'vue';

const API_PREFIX = '/api';
const DEFAULT_TIMEOUT_MS = 45000;

const withTimeout = async (promiseFactory, timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await promiseFactory(controller.signal);
  } finally {
    clearTimeout(timeoutId);
  }
};

const parseApiError = async (response) => {
  const payload = await response.json().catch(() => null);
  return payload?.error || `Erreur HTTP ${response.status}`;
};

export function useApi() {
  const loading = ref(false);
  const error = ref('');

  const request = async (endpoint, options = {}) => {
    const {
      timeout = DEFAULT_TIMEOUT_MS,
      headers = {},
      body,
      ...rest
    } = options;

    loading.value = true;
    error.value = '';

    try {
      return await withTimeout(async (signal) => {
        const response = await fetch(`${API_PREFIX}${endpoint}`, {
          signal,
          headers: {
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...headers,
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          ...rest,
        });

        if (!response.ok) {
          throw new Error(await parseApiError(response));
        }

        return await response.json();
      }, timeout);
    } catch (requestError) {
      if (requestError?.name === 'AbortError') {
        error.value = 'Requete expiree. Reessayez.';
        throw new Error(error.value);
      }

      error.value = requestError?.message || 'Erreur API inconnue.';
      throw requestError;
    } finally {
      loading.value = false;
    }
  };

  const convert = (url, format = 'mp3') =>
    request('/convert', {
      method: 'POST',
      body: { url, format },
    });

  const getCapabilities = () =>
    request('/capabilities', {
      method: 'GET',
      timeout: 8000,
    });

  const checkHealth = () =>
    request('/health', {
      method: 'GET',
      timeout: 8000,
    });

  return {
    loading,
    error,
    request,
    convert,
    getCapabilities,
    checkHealth,
  };
}
