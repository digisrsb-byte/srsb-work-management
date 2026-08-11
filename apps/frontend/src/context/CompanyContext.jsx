import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import api from '../services/api.js';
import { useAuth } from './AuthContext.jsx';

const CompanyContext = createContext(null);

const FALLBACK = {
  displayName: 'Work Management',
  legalName: 'Work Management',
  logoDataUrl: null,
  tagline: 'Desktop Operations Suite',
  sacCode: '998616',
  stateCode: '',
  gstNumber: '',
  address: '',
  phone: '',
  email: '',
  bankAccountName: '',
  bankAccountNumber: '',
  bankIfsc: '',
  bankName: '',
  bankBranch: '',
  authorisedSignatory: 'Authorised Signatory',
  invoicePrefix: 'INV',
  signatureDataUrl: null,
  recruitmentDescription:
    'This is with Regard to manpower recruitment charges of below mentioned Candidates'
};

export function CompanyProvider({ children }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState(FALLBACK);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setSettings(FALLBACK);
      return null;
    }

    try {
      setLoading(true);
      const response = await api.get('/company/settings');
      const data = response.data.data || {};
      const next = {
        ...FALLBACK,
        ...data,
        recruitmentDescription: FALLBACK.recruitmentDescription
      };
      setSettings(next);
      if (data.companyCode) {
        localStorage.setItem('srsb_company_code', data.companyCode);
      }
      return next;
    } catch {
      setSettings((current) => ({
        ...FALLBACK,
        displayName:
          user.companyName ||
          user.fullName ||
          current.displayName,
        companyCode: user.companyCode
      }));
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const invoiceProfile = useMemo(
    () => ({
      legalName: settings.legalName || FALLBACK.legalName,
      gstNumber: settings.gstNumber || '',
      registeredAddress: settings.address || '',
      email: settings.email || '',
      phone: settings.phone || '',
      sacCode: settings.sacCode || '998616',
      stateCode: settings.stateCode || '',
      recruitmentDescription: settings.recruitmentDescription,
      bankAccountName: settings.bankAccountName || '',
      bankAccountNumber: settings.bankAccountNumber || '',
      bankIfsc: settings.bankIfsc || '',
      bankName: settings.bankName || '',
      bankBranch: settings.bankBranch || '',
      signatoryLabel:
        settings.authorisedSignatory || 'Authorised Signatory',
      logoDataUrl: settings.logoDataUrl || null,
      signatureDataUrl: settings.signatureDataUrl || null
    }),
    [settings]
  );

  const value = useMemo(
    () => ({
      settings,
      invoiceProfile,
      loading,
      refresh,
      setSettings
    }),
    [settings, invoiceProfile, loading, refresh]
  );

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}
