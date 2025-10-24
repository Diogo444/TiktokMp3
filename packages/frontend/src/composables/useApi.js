import { ref } from 'vue';

export function useApi() {
  const loading = ref(false);
  const error = ref(null);

  const apiCall = async (endpoint, options = {}) => {
    loading.value = true;
    error.value = null;

    try {
      const response = await fetch(`/api${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const downloadVideo = async (url) => {
    return apiCall('/download', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  };

  const checkHealth = async () => {
    return apiCall('/health');
  };

  return {
    loading,
    error,
    downloadVideo,
    checkHealth,
    apiCall,
  };
}
