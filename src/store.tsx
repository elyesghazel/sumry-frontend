import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ApiError,
  api,
  type Account,
  type Budget,
  type BudgetProgress,
  type Category,
  type Me,
  type Transaction,
} from './api';
import type { Timeframe } from './analytics';

const TOKEN_KEY = 'sumry.token';
const THEME_KEY = 'sumry.theme';
const TF_KEY = 'sumry.timeframe';

export type ThemeMode = 'dark' | 'light';

type Ctx = {
  status: 'loading' | 'signed-out' | 'signed-in';
  user: Me | null;
  token: string | null;

  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  progress: BudgetProgress[];

  loading: boolean;
  error: string | null;

  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;

  timeframe: Timeframe;
  setTimeframe: (tf: Timeframe) => void;

  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Ctx['status']>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<Me | null>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [progress, setProgress] = useState<BudgetProgress[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [theme, setThemeState] = useState<ThemeMode>(
    () => (localStorage.getItem(THEME_KEY) as ThemeMode | null) ?? 'dark',
  );
  const [timeframe, setTimeframeState] = useState<Timeframe>(
    () => (localStorage.getItem(TF_KEY) as Timeframe | null) ?? '30d',
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    localStorage.setItem(THEME_KEY, mode);
    setThemeState(mode);
  }, []);

  const setTimeframe = useCallback((tf: Timeframe) => {
    localStorage.setItem(TF_KEY, tf);
    setTimeframeState(tf);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setAccounts([]);
    setCategories([]);
    setTransactions([]);
    setBudgets([]);
    setProgress([]);
    setStatus('signed-out');
  }, []);

  const loadAll = useCallback(
    async (t: string) => {
      setLoading(true);
      const now = new Date();
      try {
        const [acc, cat, tx, bud, prog] = await Promise.all([
          api.accounts(t),
          api.categories(t),
          api.transactions(t),
          api.budgets(t),
          api.budgetProgress(t, now.getMonth() + 1, now.getFullYear()),
        ]);
        setAccounts(acc);
        setCategories(cat.filter((c) => c.isActive !== false));
        setTransactions(tx);
        setBudgets(bud);
        setProgress(prog);
        setError(null);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          signOut();
          return;
        }
        setError(e instanceof Error ? e.message : 'Something went wrong');
      } finally {
        setLoading(false);
      }
    },
    [signOut],
  );

  // Restore a stored session on load.
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setStatus('signed-out');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const me = await api.me(stored);
        if (cancelled) return;
        setToken(stored);
        setUser(me);
        setStatus('signed-in');
        await loadAll(stored);
      } catch {
        if (!cancelled) signOut();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAll, signOut]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { token: t } = await api.login(email.trim(), password);
      localStorage.setItem(TOKEN_KEY, t);
      const me = await api.me(t);
      setToken(t);
      setUser(me);
      setStatus('signed-in');
      await loadAll(t);
    },
    [loadAll],
  );

  const refresh = useCallback(async () => {
    if (token) await loadAll(token);
  }, [token, loadAll]);

  const value = useMemo<Ctx>(
    () => ({
      status, user, token,
      accounts, categories, transactions, budgets, progress,
      loading, error,
      theme, setTheme,
      timeframe, setTimeframe,
      signIn, signOut, refresh,
    }),
    [
      status, user, token, accounts, categories, transactions, budgets, progress,
      loading, error, theme, setTheme, timeframe, setTimeframe, signIn, signOut, refresh,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
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
