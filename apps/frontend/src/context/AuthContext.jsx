import {
  createContext,
  useContext,
  useMemo,
  useState
} from 'react';
import api from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('srsb_user');
    return saved ? JSON.parse(saved) : null;
  });

  async function login(loginId, password) {
    const response = await api.post('/auth/login', {
      loginId,
      password
    });

    const {
      token,
      user: loggedUser
    } = response.data.data;

    localStorage.setItem('srsb_token', token);
    localStorage.setItem(
      'srsb_user',
      JSON.stringify(loggedUser)
    );

    setUser(loggedUser);
    return loggedUser;
  }

  function updateUser(updatedFields) {
    setUser((currentUser) => {
      const updatedUser = {
        ...currentUser,
        ...updatedFields
      };

      localStorage.setItem(
        'srsb_user',
        JSON.stringify(updatedUser)
      );

      return updatedUser;
    });
  }

  function logout() {
    localStorage.removeItem('srsb_token');
    localStorage.removeItem('srsb_user');
    setUser(null);
  }

  const value = useMemo(
    () => ({
      user,
      login,
      logout,
      updateUser
    }),
    [user]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}