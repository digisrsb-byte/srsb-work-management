import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    const adminRoles = ['SUPER_ADMIN','ADMIN','HR','MANAGER'];
    return <Navigate to={adminRoles.includes(user.role) ? '/admin' : '/employee'} replace />;
  }
  return children;
}
