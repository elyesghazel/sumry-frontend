import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ApiError,
  type Account,
  type Budget,
  type BudgetProgress,
  type Category,
  type Forecast,
  type Goal,
  type Me,
  type Occurrence,
  type Planned,
  type Preferences,
  type Rule,
  type SafeToSpend,
  type Subscriptions,
  type Transaction,
  type Timeframe,
} from '../core';
import { api } from './api';

const TOKEN_KEY = 'sumry.token';
const THEME_KEY = 'sumry.theme';
const DENSITY_KEY = 'sumry.density';
const TF_KEY = 'sumry.timeframe';
const PRIVACY_KEY = 'sumry.privacy';

export type ThemeMode = 'system' | 'light' | 'dark';
export type Density = 'comfortable' | 'compact';

type Ctx = {
  status: 'loading' | 'signed-out' | 'signed-in';
  user: Me | null;
  token: string | null;

  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  progress: BudgetProgress[];
  planned: Planned[];
  upcoming: Occurrence[];
  safe: SafeToSpend | null;
  goals: Goal[];
  rules: Rule[];
  forecast: Forecast | null;
  subscriptions: Subscriptions | null;
  preferences: Preferences | null;

  loading: boolean;
  error: string | null;

  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  density: Density;
  setDensity: (d: Density) => void;
  privacy: boolean;
  setPrivacy: (on: boolean) => void;

  timeframe: Timeframe;
  setTimeframe: (tf: Timeframe) => void;

  signIn: (email: string, password: string) => Promise<void>;
  signOut: (everywhere?: boolean) => Promise<void>;
  adoptToken: (token: string) => void;
  /** Reloads everything; `only` narrows it to the domains that changed. */
  refresh: (only?: Domain[]) => Promise<void>;
  toast: (message: string) => void;
};

export type Domain = 'core' | 'budgets' | 'planned' | 'goals' | 'rules' | 'insights' | 'prefs';

const Ctx = createContext<Ctx | null>(null);

function stored<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Ctx['status']>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<Me | null>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [progress, setProgress] = useState<BudgetProgress[]>([]);
  const [planned, setPlanned] = useState<Planned[]>([]);
  const [upcoming, setUpcoming] = useState<Occurrence[]>([]);
  const [safe, setSafe] = useState<SafeToSpend | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscriptions | null>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [theme, setThemeState] = useState<ThemeMode>(() => stored(THEME_KEY, 'system'));
  const [density, setDensityState] = useState<Density>(() => stored(DENSITY_KEY, 'comfortable'));
  const [privacy, setPrivacyState] = useState<boolean>(() => stored<string>(PRIVACY_KEY, 'off') === 'on');
  const [timeframe, setTimeframeState] = useState<Timeframe>(() => stored(TF_KEY, '30d'));

  // Only an explicit choice is stamped on the root; "system" leaves it to the media query.
  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#17150f' : '#f4f1ea');
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);
  useEffect(() => {
    document.documentElement.dataset.privacy = privacy ? 'on' : 'off';
  }, [privacy]);

  const setTheme = useCallback(
    (mode: ThemeMode) => {
      try { localStorage.setItem(THEME_KEY, mode); } catch { /* private mode */ }
      setThemeState(mode);
      if (token) api.updatePreferences(token, { theme: mode }).catch(() => undefined);
    },
    [token],
  );
  const setDensity = useCallback((d: Density) => {
    try { localStorage.setItem(DENSITY_KEY, d); } catch { /* private mode */ }
    setDensityState(d);
  }, []);
  const setPrivacy = useCallback((on: boolean) => {
    try { localStorage.setItem(PRIVACY_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
    setPrivacyState(on);
  }, []);
  const setTimeframe = useCallback(
    (tf: Timeframe) => {
      try { localStorage.setItem(TF_KEY, tf); } catch { /* private mode */ }
      setTimeframeState(tf);
      if (token) api.updatePreferences(token, { timeframe: tf }).catch(() => undefined);
    },
    [token],
  );

  const toastTimer = useRef<number | null>(null);
  const toast = useCallback((message: string) => {
    setToastMsg(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const clear = useCallback(() => {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
    setToken(null);
    setUser(null);
    setAccounts([]); setCategories([]); setTransactions([]); setBudgets([]); setProgress([]);
    setPlanned([]); setUpcoming([]); setSafe(null); setGoals([]); setRules([]);
    setForecast(null); setSubscriptions(null); setPreferences(null);
    setStatus('signed-out');
  }, []);

  const load = useCallback(
    async (t: string, only?: Domain[]) => {
      const want = (d: Domain) => !only || only.includes(d);
      setLoading(true);
      try {
        const jobs: Promise<unknown>[] = [];
        if (want('core')) {
          jobs.push(
            api.accounts(t).then(setAccounts),
            api.categories(t).then((cat) => setCategories(cat.filter((c) => c.isActive !== false))),
            api.transactions(t).then(setTransactions),
          );
        }
        if (want('budgets') || want('core')) {
          jobs.push(api.budgets(t).then(setBudgets), api.budgetProgress(t).then(setProgress));
        }
        if (want('planned') || want('core')) {
          jobs.push(
            api.planned(t).then(setPlanned),
            api.upcoming(t, 45).then(setUpcoming),
            api.safeToSpend(t).then(setSafe),
          );
        }
        if (want('goals') || want('core')) jobs.push(api.goals(t).then(setGoals));
        if (want('rules')) jobs.push(api.rules(t).then(setRules));
        if (want('insights') || want('core')) {
          jobs.push(api.forecast(t).then(setForecast), api.subscriptions(t).then(setSubscriptions));
        }
        if (want('prefs')) {
          jobs.push(
            api.preferences(t).then((p) => {
              setPreferences(p);
              if (p.theme && p.theme !== stored(THEME_KEY, 'system')) {
                setThemeState(p.theme);
                try { localStorage.setItem(THEME_KEY, p.theme); } catch { /* private mode */ }
              }
            }),
          );
        }
        await Promise.all(jobs);
        setError(null);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          clear();
          return;
        }
        setError(e instanceof Error ? e.message : 'Something went wrong');
      } finally {
        setLoading(false);
      }
    },
    [clear],
  );

  // Restore a stored session on load.
  useEffect(() => {
    let storedToken: string | null = null;
    try { storedToken = localStorage.getItem(TOKEN_KEY); } catch { /* private mode */ }
    if (!storedToken) {
      setStatus('signed-out');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const me = await api.me(storedToken!);
        if (cancelled) return;
        setToken(storedToken);
        setUser(me);
        setStatus('signed-in');
        await load(storedToken!, ['core', 'rules', 'prefs']);
      } catch {
        if (!cancelled) clear();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, clear]);

  const adoptToken = useCallback((t: string) => {
    try { localStorage.setItem(TOKEN_KEY, t); } catch { /* private mode */ }
    setToken(t);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { token: t } = await api.login(email.trim(), password);
      adoptToken(t);
      const me = await api.me(t);
      setUser(me);
      setStatus('signed-in');
      await load(t, ['core', 'rules', 'prefs']);
    },
    [load, adoptToken],
  );

  const signOut = useCallback(
    async (everywhere = false) => {
      if (token) {
        try {
          if (everywhere) await api.logoutEverywhere(token);
          else await api.logout(token);
        } catch {
          /* the token is dropped locally regardless */
        }
      }
      clear();
    },
    [token, clear],
  );

  const refresh = useCallback(
    async (only?: Domain[]) => {
      if (token) await load(token, only);
    },
    [token, load],
  );

  const value = useMemo<Ctx>(
    () => ({
      status, user, token,
      accounts, categories, transactions, budgets, progress, planned, upcoming, safe, goals, rules,
      forecast, subscriptions, preferences,
      loading, error,
      theme, setTheme, density, setDensity, privacy, setPrivacy,
      timeframe, setTimeframe,
      signIn, signOut, adoptToken, refresh, toast,
    }),
    [
      status, user, token, accounts, categories, transactions, budgets, progress, planned, upcoming, safe,
      goals, rules, forecast, subscriptions, preferences, loading, error, theme, setTheme, density,
      setDensity, privacy, setPrivacy, timeframe, setTimeframe, signIn, signOut, adoptToken, refresh, toast,
    ],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {toastMsg ? <div className="toast fade-in" role="status">{toastMsg}</div> : null}
    </Ctx.Provider>
  );
}

export function useStore(): Ctx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

/** Fixed categorical order, read from CSS so both themes stay in one place. */
export const SERIES = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8'];

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Stable colour for a category, so identity never shifts when a list is filtered. */
export function categoryColor(key: string, explicit?: string | null): string {
  if (explicit && /^#[0-9a-f]{6}$/i.test(explicit)) return explicit;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return cssVar(SERIES[hash % SERIES.length]);
}

// ------------------------------------------------------------------- routing

export type Page = 'home' | 'activity' | 'accounts' | 'budgets' | 'plan' | 'insights' | 'settings';

const PAGES: Page[] = ['home', 'activity', 'accounts', 'budgets', 'plan', 'insights', 'settings'];

export type Route = { page: Page; params: URLSearchParams };

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const page = (PAGES as string[]).includes(path) ? (path as Page) : 'home';
  return { page, params: new URLSearchParams(query) };
}

/** Hash routing: linkable pages, working back button, no dependency. */
export function useRoute(): [Route, (page: Page, params?: Record<string, string>) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash());
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const go = useCallback((page: Page, params?: Record<string, string>) => {
    const q = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '')).toString() : '';
    window.location.hash = `/${page}${q ? `?${q}` : ''}`;
  }, []);
  return [route, go];
}

export const href = (page: Page, params?: Record<string, string>) => {
  const q = params ? new URLSearchParams(params).toString() : '';
  return `#/${page}${q ? `?${q}` : ''}`;
};
