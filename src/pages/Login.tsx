import { useState, type FormEvent } from 'react';
import { useStore } from '../store';

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
      <form className="login card fade-in" onSubmit={submit}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 30, fontWeight: 300, letterSpacing: '-0.03em' }}>Sumry</div>
          <div className="faint" style={{ fontSize: 13 }}>
            See your money. Understand it.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            className="input"
            type="email"
            placeholder="Email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error ? (
            <div className="neg" style={{ fontSize: 13 }}>
              {error}
            </div>
          ) : null}

          <button className="btn primary" type="submit" disabled={busy || !email || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>

        <p className="faint" style={{ fontSize: 11.5, marginTop: 18, marginBottom: 0 }}>
          Accounts are created in the mobile app. This dashboard is read-mostly: it shows
          and analyses your data, and logging happens on your phone.
        </p>
      </form>
    </div>
  );
}
