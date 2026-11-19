import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { ErrorLine } from '../ui';

/** The token is read once and dropped from the address bar, like an invite code. */
function tokenFromUrl(): string {
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('token')?.trim() ?? '';
    if (token) {
      url.searchParams.delete('token');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    return token;
  } catch {
    return '';
  }
}

/** Public page at `/reset?token=...`: sets a new password with a token an admin handed out. */
export function ResetPassword() {
  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = !!token.trim() && password.length >= 12 && password === repeat;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword(token.trim(), password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset the password');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="login-wrap">
        <div className="login fade-in">
          <h1>Sumry</h1>
          <p className="muted" style={{ marginBottom: 26 }}>Password changed. Every device was signed out.</p>
          <a className="btn primary" href="/" style={{ padding: '11px 16px', display: 'block', textAlign: 'center' }}>Sign in</a>
        </div>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <form className="login fade-in" onSubmit={submit}>
        <h1>Sumry</h1>
        <p className="muted" style={{ marginBottom: 26 }}>Choose a new password.</p>
        <div className="stack" style={{ gap: 10 }}>
          <input className="input lg mono" type="text" placeholder="Reset token" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} required />
          <input className="input lg" type="password" placeholder="New password (12+ characters)" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <input className="input lg" type="password" placeholder="Repeat" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
          {repeat && password !== repeat ? <div className="small muted">The two passwords differ.</div> : null}
          <ErrorLine>{error}</ErrorLine>
          <button className="btn primary" type="submit" disabled={busy || !ready} style={{ padding: '11px 16px' }}>
            {busy ? 'Saving…' : 'Set password'}
          </button>
        </div>
        <p className="tiny faint" style={{ marginTop: 22 }}>
          A reset link works once and for 24 hours. If it has expired, ask whoever runs this Sumry instance for a new one.{' '}
          <a className="link" href="/">Back to sign in</a>
        </p>
      </form>
    </div>
  );
}
