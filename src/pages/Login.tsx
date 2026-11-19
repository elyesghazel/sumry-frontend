import { useEffect, useState, type FormEvent } from 'react';
import type { RegistrationMode } from '../../core';
import { api } from '../api';
import { useStore } from '../store';
import { ErrorLine } from '../ui';
import { LegalLinks, useLegal } from '../legal';

/** An invite link is `/?invite=CODE`; the code is read once and dropped from the address bar. */
function inviteFromUrl(): string {
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('invite')?.trim() ?? '';
    if (code) {
      url.searchParams.delete('invite');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    return code;
  } catch {
    return '';
  }
}

export function Login() {
  const { signIn, signedOutReason } = useStore();
  const [initialInvite] = useState(inviteFromUrl);
  const [mode, setMode] = useState<RegistrationMode>('closed');
  const [signup, setSignup] = useState(initialInvite !== '');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState(initialInvite);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const legal = useLegal();
  const [error, setError] = useState<string | null>(null);

  // An older backend without /api/config, or one that is unreachable, means no signup.
  useEffect(() => {
    let cancelled = false;
    api.config()
      .then((c) => { if (!cancelled) setMode(c.registrationMode); })
      .catch(() => { /* stays closed */ });
    return () => { cancelled = true; };
  }, []);

  const canSignUp = mode === 'open' || mode === 'invite';
  const showSignup = signup && canSignUp;
  const needsInvite = mode === 'invite';
  // Only instances that publish a privacy policy ask for consent to it.
  const needsConsent = !!legal?.privacy;

  const switchTo = (next: boolean) => {
    setSignup(next);
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (showSignup) {
        await api.register(username.trim(), email.trim(), password, needsInvite ? invite.trim() : null);
      }
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : showSignup ? 'Could not create the account' : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  const signupReady = !!username.trim() && !!email && password.length >= 12 && (!needsInvite || !!invite.trim()) && (!needsConsent || consent);
  const ready = showSignup ? signupReady : !!email && !!password;

  return (
    <div className="login-wrap">
      <form className="login fade-in" onSubmit={submit}>
        <h1>Sumry</h1>
        <p className="muted" style={{ marginBottom: 26 }}>
          {showSignup ? 'Create your account.' : 'See your money. Understand it.'}
        </p>
        <div className="stack" style={{ gap: 10 }}>
          {showSignup ? (
            <input className="input lg" type="text" placeholder="Name" autoComplete="nickname" value={username} onChange={(e) => setUsername(e.target.value)} required />
          ) : null}
          <input className="input lg" type="email" placeholder="Email" autoComplete={showSignup ? 'email' : 'username'} value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input
            className="input lg"
            type="password"
            placeholder={showSignup ? 'Password (12+ characters)' : 'Password'}
            autoComplete={showSignup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {showSignup && needsInvite ? (
            <input className="input lg mono" type="text" placeholder="Invite code" autoComplete="off" spellCheck={false} value={invite} onChange={(e) => setInvite(e.target.value)} required />
          ) : null}
          {showSignup && needsConsent ? (
            <label className="consent">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
              <span>
                I have read the{' '}
                <a className="link" href="/privacy" target="_blank" rel="noopener">privacy policy</a>
              </span>
            </label>
          ) : null}
          {signedOutReason && !error ? <p className="small muted" role="status">{signedOutReason}</p> : null}
          <ErrorLine>{error}</ErrorLine>
          <button className="btn primary" type="submit" disabled={busy || !ready} style={{ padding: '11px 16px' }}>
            {showSignup ? (busy ? 'Creating account…' : 'Create account') : (busy ? 'Signing in…' : 'Sign in')}
          </button>
        </div>
        {canSignUp ? (
          <p className="small muted" style={{ marginTop: 18 }}>
            {showSignup ? 'Already have an account? ' : needsInvite ? 'Got an invite? ' : 'New here? '}
            <button type="button" className="btn ghost sm" onClick={() => switchTo(!showSignup)}>
              {showSignup ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        ) : null}
        <p className="tiny faint" style={{ marginTop: 22 }}>
          {showSignup
            ? needsInvite
              ? 'This instance is invite-only. Each code works once.'
              : 'Your data stays on this instance. You can export or delete it from Settings at any time.'
            : 'Ten wrong passwords lock sign-in for fifteen minutes. Sessions can be ended from Settings on any device.'}
        </p>
        <LegalLinks style={{ marginTop: 14 }} />
      </form>
    </div>
  );
}
