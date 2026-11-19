import type {
  Account,
  Budget,
  BudgetPeriod,
  BudgetProgress,
  Cashflow,
  Category,
  CategoryType,
  ExportParams,
  Forecast,
  Frequency,
  FxRates,
  Goal,
  GoalInput,
  GoalPatch,
  ImportCheck,
  ImportCheckInput,
  ImportCommit,
  ImportCommitInput,
  ImportPreview,
  ImportPreviewInput,
  MatchType,
  Me,
  Occurrence,
  Planned,
  Preferences,
  Profile,
  PublicConfig,
  QuickEntry,
  Rule,
  RuleApplyResult,
  SafeToSpend,
  SearchParams,
  Session,
  ShortcutToken,
  Statement,
  Subscriptions,
  Transaction,
  TransactionPage,
} from './types';

/**
 * Typed client for the Sumry backend, shared by web and phone.
 *
 * Platform bits are injected: the base URL (Vite env on the web, Expo config on the phone)
 * and optionally a fetch implementation. Tokens stay explicit per call; where they are
 * stored (localStorage, SecureStore) is up to each app.
 */

/** The subset of the Fetch API the client needs, so core does not depend on DOM typings. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export type ApiConfig = {
  /** Origin of the backend without the trailing `/api`, e.g. `https://sumry.elyesghazel.ch`. */
  baseUrl: string;
  /** Defaults to the global fetch. */
  fetch?: FetchLike;
  /** Called on every 401 before the error is thrown, e.g. to drop a dead session. */
  onUnauthorized?: (path: string) => void;
};

export class ApiError extends Error {
  readonly status: number;
  /** The parsed error body, e.g. `{ error: 'plan_limit', limit: 'accounts' }`. */
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body ?? null;
  }
}

/** Pulls the most useful line out of the backend's several error shapes. */
export function messageFrom(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (b.error === 'plan_limit') return 'Not included in the free plan.';
    if (typeof b.message === 'string') return b.message;
    if (Array.isArray(b.validationErrors)) {
      const first = b.validationErrors[0] as { message?: string } | undefined;
      if (first?.message) return first.message;
    }
    if (typeof b.error === 'string') return b.error;
  }
  if (status === 401) return 'Session expired. Please sign in again.';
  if (status === 429) return 'Too many attempts. Wait a moment and try again.';
  return `Request failed (${status})`;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

/** `?a=1&b=x`, skipping empty values; '' when nothing is left. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

type Options = { token?: string | null; body?: unknown; method?: string; raw?: boolean };

const globalFetch: FetchLike = (url, init) =>
  (globalThis as unknown as { fetch: FetchLike }).fetch(url, init);

export function createApi(config: ApiConfig) {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const doFetch = config.fetch ?? globalFetch;

  async function request<T>(path: string, opts: Options = {}): Promise<T> {
    const { token, body, method = body === undefined ? 'GET' : 'POST' } = opts;

    const res = await doFetch(baseUrl + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401) config.onUnauthorized?.(path);
      const errBody = text ? safeJson(text) : null;
      throw new ApiError(res.status, messageFrom(res.status, errBody), errBody);
    }
    if (opts.raw) return text as unknown as T;
    return (text ? safeJson(text) : null) as T;
  }

  return {
    baseUrl,

    // ---- session
    login: (email: string, password: string) =>
      request<Session>('/api/users/login', { body: { email, password } }),
    /** Public, no token: tells a client whether to offer signup and whether it needs an invite. */
    config: () => request<PublicConfig>('/api/config'),
    /** `inviteCode` is required when the instance is invite-only and ignored otherwise. */
    register: (username: string, email: string, password: string, inviteCode?: string | null) =>
      request<Me>('/api/users/register', { body: { username, email, password, inviteCode: inviteCode || null } }),
    me: (token: string) => request<Me>('/api/users/validate', { token }),
    /** Profile plus plan, limits and aiEnabled. Older backends answer 404. */
    profile: (token: string) => request<Profile>('/api/users/me', { token }),
    logout: (token: string) => request<void>('/api/users/logout', { token, method: 'POST', body: {} }),
    logoutEverywhere: (token: string) => request<void>('/api/users/logout-all', { token, method: 'POST', body: {} }),
    /** Returns a fresh token: every other session is invalidated by the change. */
    changePassword: (token: string, currentPassword: string, newPassword: string) =>
      request<Session>('/api/users/password', { token, body: { currentPassword, newPassword }, method: 'PUT' }),
    /** A year-long token for Apple Shortcuts that only reaches /api/shortcut. */
    shortcutToken: (token: string) =>
      request<ShortcutToken>('/api/users/shortcut-token', { token, method: 'POST', body: {} }),
    /** Deletes the user and all their data. The password is asked again so a leaked token is not enough. */
    deleteMe: (token: string, password: string) =>
      request<void>('/api/users/me', { token, body: { password }, method: 'DELETE' }),
    preferences: (token: string) => request<Preferences>('/api/users/preferences', { token }),
    updatePreferences: (token: string, patch: Partial<Preferences>) =>
      request<Preferences>('/api/users/preferences', { token, body: patch, method: 'PUT' }),

    // ---- accounts
    accounts: (token: string) => request<Account[]>('/api/users/accounts/', { token }),
    createAccount: (token: string, accountName: string, currentBalance: number, currency = 'CHF', spending = true) =>
      request<Account>('/api/users/accounts', { token, body: { accountName, currentBalance, currency, spending } }),
    updateAccount: (
      token: string,
      id: string,
      patch: { accountName?: string; currentBalance?: number; currency?: string; spending?: boolean },
    ) => request<Account>(`/api/users/accounts/${id}`, { token, body: patch, method: 'PUT' }),
    deleteAccount: (token: string, id: string) =>
      request<void>(`/api/users/accounts/${id}`, { token, method: 'DELETE' }),
    /** Sets the balance to what the bank says; returns the correcting entry, or null when none was needed. */
    reconcileAccount: (token: string, id: string, newBalance: number, note?: string | null) =>
      request<Transaction | null>(`/api/users/accounts/reconcile/${id}`, {
        token,
        body: { newBalance, note: note ?? null },
        method: 'PUT',
      }),
    /** Income and expenses of one account this calendar month. */
    cashflow: (token: string, accountId: string) =>
      request<Cashflow>(`/api/transactions/cashflow/${accountId}`, { token }),

    // ---- categories
    categories: (token: string) => request<Category[]>('/api/category/user', { token }),
    // The backend identifies categories by label and takes it in the body, including on
    // DELETE, which is unusual but is the contract.
    deleteCategory: (token: string, label: string) =>
      request<void>('/api/category/label', { token, body: { label }, method: 'DELETE' }),
    createCategory: (
      token: string,
      input: { label: string; parentGroup?: string | null; color?: string | null; icon?: string | null; categoryType: CategoryType },
    ) => request<Category>('/api/category/', { token, body: input }),
    updateCategory: (
      token: string,
      input: { label: string; newLabel?: string; parentGroup?: string | null; color?: string | null; icon?: string | null; categoryType?: CategoryType },
    ) => request<Category>('/api/category/label', { token, body: input, method: 'PUT' }),

    // ---- transactions
    transactions: (token: string) => request<Transaction[]>('/api/transactions/', { token }),
    search: (token: string, p: SearchParams) =>
      request<TransactionPage>(`/api/transactions/search${qs(p)}`, { token }),
    /** Natural-language entry; books it when `book` is true and nothing is missing. */
    quick: (token: string, text: string, book: boolean, accountId?: string | null) =>
      request<QuickEntry>('/api/transactions/quick', { token, body: { text, book, accountId: accountId ?? null } }),
    createTransaction: (
      token: string,
      input: { amount: number; description?: string | null; categoryLabel?: string | null; date: string; userAccountId: string },
    ) => request<Transaction>('/api/transactions/', { token, body: input }),
    updateTransaction: (
      token: string,
      id: string,
      patch: { amount?: number; description?: string | null; categoryLabel?: string; date?: string; userAccountId?: string },
    ) => request<Transaction>(`/api/transactions/${id}`, { token, body: patch, method: 'PUT' }),
    deleteTransaction: (token: string, id: string) =>
      request<void>(`/api/transactions/${id}`, { token, method: 'DELETE' }),
    createTransfer: (
      token: string,
      input: { amount: number; description?: string | null; fromAccountId: string; toAccountId: string; date: string; toAmount?: number | null },
    ) => request<{ transferGroupId: string }>('/api/transactions/transfer', { token, body: input }),
    updateTransfer: (
      token: string,
      groupId: string,
      patch: { amount?: number; description?: string | null; fromAccountId?: string; toAccountId?: string; date?: string; toAmount?: number | null },
    ) => request<{ transferGroupId: string }>(`/api/transactions/transfer/${groupId}`, { token, body: patch, method: 'PUT' }),
    deleteTransfer: (token: string, groupId: string) =>
      request<void>(`/api/transactions/transfer/${groupId}`, { token, method: 'DELETE' }),

    // ---- budgets
    budgets: (token: string) => request<Budget[]>('/api/budgets', { token }),
    /** Progress for the period containing today (or `date`, ISO day). */
    budgetProgress: (token: string, date?: string) =>
      request<BudgetProgress[]>(`/api/budgets/progress${qs({ date })}`, { token }),
    createBudget: (
      token: string,
      input: { categoryLabel: string; maxAmount: number; period?: BudgetPeriod; rollover?: boolean; startDay?: number },
    ) => request<Budget>('/api/budgets', { token, body: input }),
    updateBudget: (
      token: string,
      id: string,
      patch: { limitAmount?: number; period?: BudgetPeriod; rollover?: boolean; startDay?: number },
    ) => request<Budget>(`/api/budgets/${id}`, { token, body: patch, method: 'PUT' }),
    deleteBudget: (token: string, id: string) => request<void>(`/api/budgets/${id}`, { token, method: 'DELETE' }),

    // ---- planned
    planned: (token: string, includeInactive = false) =>
      request<Planned[]>(`/api/planned${qs({ includeInactive })}`, { token }),
    createPlanned: (
      token: string,
      input: {
        name: string; amount: number; description?: string | null; startDate: string; endDate?: string | null;
        frequency: Frequency; categoryLabel?: string | null; accountId: string; toAccountId?: string | null; autoBook?: boolean;
      },
    ) => request<Planned>('/api/planned', { token, body: input }),
    updatePlanned: (
      token: string,
      id: string,
      patch: {
        name?: string; amount?: number; description?: string | null; startDate?: string; endDate?: string | null; clearEndDate?: boolean;
        frequency?: Frequency; categoryLabel?: string; accountId?: string; toAccountId?: string; autoBook?: boolean; isActive?: boolean;
      },
    ) => request<Planned>(`/api/planned/${id}`, { token, body: patch, method: 'PUT' }),
    deletePlanned: (token: string, id: string) => request<void>(`/api/planned/${id}`, { token, method: 'DELETE' }),
    /** Books the next due occurrence now; `date` overrides the booking date. */
    bookPlanned: (token: string, id: string, date?: string) =>
      request<Planned>(`/api/planned/${id}/book${qs({ date })}`, { token, method: 'POST', body: {} }),
    /** Lets the next occurrence pass unbooked; `date`, when given, must be that occurrence. */
    skipPlanned: (token: string, id: string, date?: string | null) =>
      request<Planned>(`/api/planned/${id}/skip${qs({ date })}`, { token, method: 'POST', body: {} }),
    /** Moves the next occurrence to `to`; the move becomes a one-off plan on that date. */
    postponePlanned: (token: string, id: string, date: string | null | undefined, to: string) =>
      request<Planned>(`/api/planned/${id}/postpone${qs({ date, to })}`, { token, method: 'POST', body: {} }),
    upcoming: (token: string, days = 45, accountId?: string) =>
      request<Occurrence[]>(`/api/planned/upcoming${qs({ days, accountId })}`, { token }),
    safeToSpend: (token: string, accountId?: string) =>
      request<SafeToSpend>(`/api/planned/safe-to-spend${qs({ accountId })}`, { token }),

    // ---- goals
    goals: (token: string, includeInactive = false) => request<Goal[]>(`/api/goals${qs({ includeInactive })}`, { token }),
    createGoal: (token: string, input: GoalInput) => request<Goal>('/api/goals', { token, body: input }),
    updateGoal: (token: string, id: string, patch: GoalPatch) =>
      request<Goal>(`/api/goals/${id}`, { token, body: patch, method: 'PUT' }),
    deleteGoal: (token: string, id: string) => request<void>(`/api/goals/${id}`, { token, method: 'DELETE' }),
    /** Puts money towards the goal; with a linked goal, `fromAccountId` makes it a real transfer. */
    contributeGoal: (token: string, id: string, amount: number, fromAccountId?: string | null, note?: string | null) =>
      request<Goal>(`/api/goals/${id}/contribute`, { token, body: { amount, fromAccountId: fromAccountId ?? null, note: note ?? null } }),

    // ---- rules
    rules: (token: string) => request<Rule[]>('/api/rules', { token }),
    createRule: (
      token: string,
      input: { pattern: string; matchType?: MatchType; categoryLabel: string; accountId?: string | null; priority?: number },
    ) => request<Rule>('/api/rules', { token, body: input }),
    updateRule: (
      token: string,
      id: string,
      patch: { pattern?: string; matchType?: MatchType; categoryLabel?: string; accountId?: string | null; clearAccount?: boolean; priority?: number; isActive?: boolean },
    ) => request<Rule>(`/api/rules/${id}`, { token, body: patch, method: 'PUT' }),
    deleteRule: (token: string, id: string) => request<void>(`/api/rules/${id}`, { token, method: 'DELETE' }),
    testRule: (token: string, description: string, accountId?: string | null) =>
      request<{ rule: Rule | null; categoryLabel: string | null }>('/api/rules/test', {
        token,
        body: { description, accountId: accountId ?? null },
      }),
    applyRules: (token: string, dryRun: boolean, from?: string, to?: string) =>
      request<RuleApplyResult>(`/api/rules/apply${qs({ dryRun, from, to })}`, { token, method: 'POST', body: {} }),

    // ---- insights
    subscriptions: (token: string) => request<Subscriptions>('/api/insights/subscriptions', { token }),
    forecast: (token: string, date?: string) => request<Forecast>(`/api/insights/forecast${qs({ date })}`, { token }),
    fx: (token: string, base = 'CHF') => request<FxRates>(`/api/fx${qs({ base })}`, { token }),

    // ---- import / export
    /** Parses a statement without booking anything: CSV text, or a PDF / camt.053 file as base64. */
    importPreview: (token: string, input: ImportPreviewInput) =>
      request<ImportPreview>('/api/import/preview', { token, body: { format: 'auto', ...input } }),
    importCheck: (token: string, input: ImportCheckInput) =>
      request<ImportCheck>('/api/import/check', { token, body: input }),
    importCommit: (token: string, input: ImportCommitInput) =>
      request<ImportCommit>('/api/import/commit', { token, body: input }),
    exportCsv: (token: string, p: ExportParams = {}) =>
      request<string>(`/api/export/transactions.csv${qs(p)}`, { token, raw: true }),
    exportJson: (token: string, p: ExportParams = {}) =>
      request<Transaction[]>(`/api/export/transactions.json${qs(p)}`, { token }),

    // ---- statement
    statement: (token: string, month?: string) => request<Statement>(`/api/statement${qs({ month })}`, { token }),
    statementHtml: (token: string, month?: string) =>
      request<string>(`/api/statement/html${qs({ month })}`, { token, raw: true }),
    mailStatus: (token: string) => request<{ configured: boolean }>('/api/statement/mail-status', { token }),
    sendStatement: (token: string, month?: string, to?: string) =>
      request<{ sentTo: string }>(`/api/statement/send${qs({ month, to })}`, { token, method: 'POST', body: {} }),
  };
}

export type SumryApi = ReturnType<typeof createApi>;
