import { useCallback, useEffect, useState } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import { authService } from './services/authService';
import type { User } from './types';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authService
      .currentUser()
      .then(setUser)
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = useCallback(() => {
    authService.logout();
    setUser(null);
  }, []);

  if (loading) {
    return <div className="app-loading">Loading…</div>;
  }

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  return <Dashboard user={user} onLogout={handleLogout} onUserChanged={setUser} />;
}
