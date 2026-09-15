import { useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { ErrorLine } from '../ui';

export function Login() {
  const { signIn } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login fade-in" onSubmit={submit}>
        <h1>Sumry</h1>
        <p className="muted" style={{ marginBottom: 26 }}>See your money. Understand it.</p>
        <div className="stack" style={{ gap: 10 }}>
          <input className="input lg" type="email" placeholder="Email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="input lg" type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <ErrorLine>{error}</ErrorLine>
          <button className="btn primary" type="submit" disabled={busy || !email || !password} style={{ padding: '11px 16px' }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
        <p className="tiny faint" style={{ marginTop: 22 }}>Ten wrong passwords lock sign-in for fifteen minutes. Sessions can be ended from Settings on any device.</p>
      </form>
    </div>
  );
}
