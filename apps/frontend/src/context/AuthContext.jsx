import {
  createContext,
  useContext,
  useMemo,
  useState
} from 'react';
import api from '../services/api.js';

const AuthContext = createContext(null);
const COMPANY_CODE_KEY = 'srsb_company_code';

function readStoredCompanyCode() {
  return localStorage.getItem(COMPANY_CODE_KEY) || '';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('srsb_user');
    return saved ? JSON.parse(saved) : null;
  });

  async function login(loginId, password, companyCode) {
    const normalizedCode = String(companyCode || '')
      .trim()
      .toUpperCase();

    const response = await api.post('/auth/login', {
      loginId,
      password,
      companyCode: normalizedCode || undefined
    });

    const {
      token,
      user: loggedUser,
      company
    } = response.data.data;

    const resolvedCode =
      company?.code ||
      loggedUser?.companyCode ||
      normalizedCode;

    localStorage.setItem('srsb_token', token);
    localStorage.setItem(
      'srsb_user',
      JSON.stringify(loggedUser)
    );
    if (resolvedCode) {
      localStorage.setItem(COMPANY_CODE_KEY, resolvedCode);
    }

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
    // Keep company code so the next login is prefilled.
    setUser(null);
  }

  const value = useMemo(
    () => ({
      user,
      login,
      logout,
      updateUser,
      storedCompanyCode: readStoredCompanyCode()
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
