import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 15000
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('srsb_token');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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

    // Only treat a 401 as an expired session when a token was already saved.
    // This prevents incorrect-password errors on the login page from
    // triggering an unnecessary reload.
    if (status === 401 && savedToken) {
      localStorage.removeItem('srsb_token');
      localStorage.removeItem('srsb_user');

      sessionStorage.setItem(
        'srsb_session_message',
        'Your session has expired. Please log in again.'
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