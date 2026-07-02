import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import Login from './pages/Login.jsx';
import Onboarding from './pages/Onboarding.jsx';
import { ForgotPassword, ResetPassword, AcceptInvite, VerifyEmail } from './pages/EmailAuth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Staff from './pages/Staff.jsx';
import Calendar from './pages/Calendar.jsx';
import Requests from './pages/Requests.jsx';
import Analytics from './pages/Analytics.jsx';
import Notifications from './pages/Notifications.jsx';
import Settings from './pages/Settings.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="center-screen"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      {/* Onboarding stays mounted across all steps: step 1 creates the account
          (which authenticates the user), steps 2-4 run authenticated. */}
      <Route path="/register" element={<Onboarding />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/staff" element={<Protected><Staff /></Protected>} />
      <Route path="/calendar" element={<Protected><Calendar /></Protected>} />
      <Route path="/requests" element={<Protected><Requests /></Protected>} />
      <Route path="/analytics" element={<Protected><Analytics /></Protected>} />
      <Route path="/notifications" element={<Protected><Notifications /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
