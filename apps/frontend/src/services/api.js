import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 60000
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('srsb_token');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    config.headers['Cache-Control'] = 'no-cache';
    config.headers.Pragma = 'no-cache';

    if (String(config.method || 'get').toLowerCase() === 'get') {
      config.params = {
        ...(config.params || {}),
        _ts: Date.now()
      };
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const savedToken = localStorage.getItem('srsb_token');
    const apiMessage = error.response?.data?.message || '';
    const suspended =
      status === 403 && /suspended/i.test(apiMessage);

    // Clear session on expired auth, or when the company is suspended mid-session.
    // Keep srsb_company_code so login stays prefilled.
    if (savedToken && (status === 401 || suspended)) {
      localStorage.removeItem('srsb_token');
      localStorage.removeItem('srsb_user');
      localStorage.removeItem('srsb_tenant');

      sessionStorage.setItem(
        'srsb_session_message',
        suspended
          ? apiMessage ||
              'This company is suspended. Contact the platform administrator.'
          : 'Your session has expired. Please log in again.'
      );

      // Prevent several failed dashboard requests from reloading repeatedly.
      if (!window.__srsbSessionRedirecting) {
        window.__srsbSessionRedirecting = true;
        window.location.reload();
      }
    }

    return Promise.reject(error);
  }
);

export default api;