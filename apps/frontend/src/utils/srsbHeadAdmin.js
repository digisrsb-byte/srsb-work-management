const DEFAULT_COMPANY_CODE = 'SRSB';
const HEAD_ADMIN_EMAIL = 'info@srsbworkforcesolutions.com';

export function isSrsbHeadAdmin(user) {
  if (!user) return false;
  const email = String(user.email || '')
    .trim()
    .toLowerCase();
  const companyCode = String(user.companyCode || '')
    .trim()
    .toUpperCase();

  return (
    user.role === 'SUPER_ADMIN' &&
    companyCode === DEFAULT_COMPANY_CODE &&
    email === HEAD_ADMIN_EMAIL
  );
}
