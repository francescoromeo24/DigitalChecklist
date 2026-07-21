import { FormEvent, useEffect, useState } from 'react';
import { authService } from '../services/authService';
import { storageService } from '../services/storageService';
import type { User } from '../types';

interface Props {
  onLogin: (user: User) => void;
}

type Mode = 'setup' | 'login' | 'forgot';

/** Turn an email into a readable display name, e.g. sam.smith@x → "Sam Smith". */
function nameFromEmail(email: string): string {
  const local = email.split('@')[0] || email;
  const pretty = local
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  return pretty || email;
}

export default function Login({ onLogin }: Props) {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // After first-run setup we show the recovery code once before entering the app.
  const [pending, setPending] = useState<{ user: User; recoveryCode: string } | null>(null);

  useEffect(() => {
    authService.hasAccounts().then((exists) => {
      setMode(exists ? 'login' : 'setup');
      setReady(true);
    });
  }, []);

  const resetFields = () => {
    setPassword('');
    setCode('');
    setError(null);
  };

  const submitSetup = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError('Choose a password of at least 6 characters.');
    setBusy(true);
    try {
      const result = await authService.registerAdmin(nameFromEmail(email), email, password);
      setPending(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account.');
    } finally {
      setBusy(false);
    }
  };

  const submitLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      onLogin(await authService.login(email, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  };

  const submitForgot = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError('Choose a new password of at least 6 characters.');
    setBusy(true);
    try {
      onLogin(await authService.recoverWithCode(email, code, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recovery failed');
    } finally {
      setBusy(false);
    }
  };

  const startFresh = async () => {
    if (
      window.confirm(
        'This permanently erases all accounts, checklists, documents and notifications on this device, and starts over. Continue?'
      )
    ) {
      await storageService.clearAll();
      authService.logout();
      setMode('setup');
      setEmail('');
      resetFields();
    }
  };

  if (!ready) return <div className="app-loading">Loading…</div>;

  // Recovery-code hand-off after the first account is created.
  if (pending) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo">
            <img src="/icon.svg" alt="" width={48} height={48} />
          </div>
          <h1>Save your recovery code</h1>
          <p className="login-subtitle">
            This is the <strong>only</strong> way to reset your password without a server.
            Store it somewhere safe — it won't be shown again.
          </p>
          <div className="recovery-code">{pending.recoveryCode}</div>
          <button className="btn btn-primary btn-block" onClick={() => onLogin(pending.user)}>
            I've saved it — continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <img src="/icon.svg" alt="" width={48} height={48} />
        </div>
        <h1>Digital Checklist</h1>

        {mode === 'setup' && (
          <>
            <p className="login-subtitle">Set your email and password to get started.</p>
            <form onSubmit={submitSetup}>
              <input type="email" placeholder="you@company.com" value={email}
                onChange={(e) => setEmail(e.target.value)} required autoFocus />
              <input type="password" placeholder="Password (min. 6 characters)" value={password}
                onChange={(e) => setPassword(e.target.value)} required />
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? 'Creating…' : 'Get started'}
              </button>
            </form>
          </>
        )}

        {mode === 'login' && (
          <>
            <p className="login-subtitle">Sign in to manage your team checklists</p>
            <form onSubmit={submitLogin}>
              <input type="email" placeholder="you@company.com" value={email}
                onChange={(e) => setEmail(e.target.value)} required autoFocus />
              <input type="password" placeholder="Password" value={password}
                onChange={(e) => setPassword(e.target.value)} required />
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
            <button type="button" className="login-link"
              onClick={() => { resetFields(); setMode('forgot'); }}>
              Forgot password?
            </button>
            <button type="button" className="login-reset-link" onClick={startFresh}>
              Reset this device &amp; start over
            </button>
          </>
        )}

        {mode === 'forgot' && (
          <>
            <p className="login-subtitle">
              Enter your email, your recovery code, and a new password.
            </p>
            <form onSubmit={submitForgot}>
              <input type="email" placeholder="you@company.com" value={email}
                onChange={(e) => setEmail(e.target.value)} required autoFocus />
              <input type="text" placeholder="Recovery code (XXXX-XXXX-XXXX)" value={code}
                onChange={(e) => setCode(e.target.value)} required />
              <input type="password" placeholder="New password (min. 6 characters)" value={password}
                onChange={(e) => setPassword(e.target.value)} required />
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? 'Resetting…' : 'Reset password & sign in'}
              </button>
            </form>
            <button type="button" className="login-link"
              onClick={() => { resetFields(); setMode('login'); }}>
              ← Back to sign in
            </button>
          </>
        )}

        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
}
