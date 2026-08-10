import { useState } from 'react';
import { StoreProvider, useStore } from './store';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Transactions } from './pages/Transactions';
import { Analytics } from './pages/Analytics';
import { Accounts } from './pages/Accounts';

export type Page = 'dashboard' | 'analytics' | 'transactions' | 'accounts';

const NAV: { key: Page; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '◧' },
  { key: 'analytics', label: 'Insights', icon: '◔' },
  { key: 'transactions', label: 'Transactions', icon: '≡' },
  { key: 'accounts', label: 'Accounts', icon: '▦' },
];

function Shell() {
  const { status, user, signOut, theme, setTheme, refresh, loading, error } = useStore();
  const [page, setPage] = useState<Page>('dashboard');
  // Set when a chart drills through to the transaction list.
  const [filter, setFilter] = useState<string>('');

  if (status === 'loading') {
    return (
      <div className="login-wrap">
        <div className="spinner" />
      </div>
    );
  }

  if (status === 'signed-out') return <Login />;

  const go = (next: Page, q = '') => {
    setFilter(q);
    setPage(next);
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark">Sumry</div>
          <div className="tag">See your money. Understand it.</div>
        </div>

        <nav className="nav">
          {NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => go(item.key)}
              aria-current={page === item.key ? 'page' : undefined}
            >
              <span aria-hidden style={{ width: 16, textAlign: 'center' }}>
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="caption">Signed in</div>
          <div className="truncate" style={{ fontSize: 13 }}>
            {user?.username}
          </div>
          <div className="truncate faint" style={{ fontSize: 12 }}>
            {user?.email}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              className="btn"
              style={{ flex: 1, padding: '8px 10px', fontSize: 13 }}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title="Toggle theme"
            >
              {theme === 'dark' ? '☾' : '☀'}
            </button>
            <button
              className="btn"
              style={{ flex: 2, padding: '8px 10px', fontSize: 13 }}
              onClick={signOut}
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <h1>{NAV.find((n) => n.key === page)?.label}</h1>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {loading ? <div className="spinner" /> : null}
            <button className="btn" onClick={refresh} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <div className="card" style={{ borderColor: 'var(--negative)' }}>
            <span className="neg">{error}</span>
          </div>
        ) : null}

        {page === 'dashboard' ? <Dashboard onDrill={(q) => go('transactions', q)} /> : null}
        {page === 'analytics' ? <Analytics onDrill={(q) => go('transactions', q)} /> : null}
        {page === 'transactions' ? <Transactions initialQuery={filter} /> : null}
        {page === 'accounts' ? <Accounts /> : null}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
