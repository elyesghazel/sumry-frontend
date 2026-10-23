/**
 * Typed client for the Sumry backend — the same contract the mobile app uses.
 *
 * VITE_API_URL lets a dev build point at a local backend; the deployed default is the
 * production API.
 */
export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://sumry.elyesghazel.ch';

export type CategoryType = 'INCOME' | 'EXPENSE';
export type TransactionKind = 'INCOME' | 'EXPENSE' | 'TRANSFER_IN' | 'TRANSFER_OUT';
export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'ONCE';
export type BudgetPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type MatchType = 'CONTAINS' | 'STARTS_WITH' | 'EQUALS' | 'REGEX';

export type Account = {
  id: string;
  userId: string | null;
  accountName: string;
  currentBalance: number;
  currency: string;
  baseBalance: number;
  baseCurrency: string;
};

export type Category = {
  id: string;
  label: string;
  parentGroup: string | null;
  color: string | null;
  icon: string | null;
  categoryType: CategoryType;
  isActive: boolean | null;
  userId: string | null;
};

export type Transaction = {
  id: string;
  amount: number;
  description: string | null;
  categoryId: string | null;
  categoryLabel: string | null;
  kind: TransactionKind;
  transferGroupId: string | null;
  date: string;
  userAccountId: string | null;
  userId: string | null;
  balanceBefore: number | null;
  balanceAfter: number | null;
  currency: string;
  fxRate: number;
  baseAmount: number;
};

export type TransactionPage = {
  items: Transaction[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
  sums: { income: number; expense: number; net: number; count: number };
};

export type SearchParams = {
  q?: string;
  accountId?: string;
  categoryLabel?: string;
  kind?: 'INCOME' | 'EXPENSE' | 'TRANSFER' | '';
  from?: string;
  to?: string;
  min?: number;
  max?: number;
  page?: number;
  size?: number;
  sort?: 'date' | 'amount';
  dir?: 'asc' | 'desc';
};

export type Budget = {
  id: string;
  limitAmount: number;
  categoryLabel: string;
  categoryColor: string | null;
  period: BudgetPeriod;
  rollover: boolean;
  startDay: number;
};

export type BudgetProgress = {
  budgetId: string;
  categoryLabel: string;
  categoryColor: string | null;
  limitAmount: number;
  spentAmount: number;
  remaining: number;
  percentage: number;
  period: BudgetPeriod;
  periodStart: string;
  periodEnd: string;
  daysLeft: number;
  rollover: boolean;
  carry: number;
  effectiveLimit: number;
  pace: 'under' | 'on' | 'over';
  perDayLeft: number;
};

export type Planned = {
  id: string;
  name: string;
  amount: number;
  description: string | null;
  startDate: string;
  endDate: string | null;
  frequency: Frequency;
  kind: TransactionKind;
  categoryLabel: string | null;
  categoryColor: string | null;
  accountId: string;
  accountName: string;
  toAccountId: string | null;
  toAccountName: string | null;
  autoBook: boolean;
  isActive: boolean;
  lastBookedOn: string | null;
  nextDate: string | null;
  monthlyEquivalent: number;
};

export type Occurrence = {
  plannedId: string;
  name: string;
  amount: number;
  kind: TransactionKind;
  date: string;
  categoryLabel: string | null;
  categoryColor: string | null;
  accountId: string;
  accountName: string;
  currency: string;
  toAccountName: string | null;
  autoBook: boolean;
  overdue: boolean;
};

export type SafeToSpend = {
  balance: number;
  accountId: string | null;
  today: string;
  horizon: string;
  daysToHorizon: number;
  horizonReason: string;
  upcomingExpenses: number;
  upcomingTransfersOut: number;
  safeToSpend: number;
  perDay: number;
  upcoming: Occurrence[];
};

export type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  targetDate: string | null;
  accountId: string | null;
  accountName: string | null;
  current: number;
  remaining: number;
  percentage: number;
  monthsLeft: number | null;
  requiredPerMonth: number | null;
  onTrack: boolean | null;
  achieved: boolean;
  color: string | null;
  icon: string | null;
  isActive: boolean;
  createdAt: string;
};

export type Rule = {
  id: string;
  pattern: string;
  matchType: MatchType;
  categoryLabel: string;
  categoryColor: string | null;
  categoryType: CategoryType;
  accountId: string | null;
  accountName: string | null;
  priority: number;
  isActive: boolean;
  hits: number;
};

export type RuleApplyResult = {
  dryRun: boolean;
  examined: number;
  changed: number;
  skippedKindMismatch: number;
  changes: {
    transactionId: string;
    date: string | null;
    description: string | null;
    fromCategory: string | null;
    toCategory: string;
    rulePattern: string;
  }[];
};

export type Subscription = {
  name: string;
  interval: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  medianAmount: number;
  monthlyEquivalent: number;
  occurrences: number;
  firstDate: string;
  lastDate: string;
  nextExpected: string;
  active: boolean;
  categoryLabel: string | null;
  categoryColor: string | null;
  accountId: string | null;
  accountName: string | null;
  paidLast12Months: number;
  planned: boolean;
};

export type Subscriptions = {
  subscriptions: Subscription[];
  activeCount: number;
  monthlyTotal: number;
  yearlyTotal: number;
};

export type Forecast = {
  monthStart: string;
  monthEnd: string;
  today: string;
  daysElapsed: number;
  daysLeft: number;
  spentSoFar: number;
  incomeSoFar: number;
  plannedExpensesRemaining: number;
  plannedIncomeRemaining: number;
  baselineDailyPace: number;
  currentDailyPace: number;
  projectedSpend: number;
  projectedIncome: number;
  projectedNet: number;
  lastMonthSpend: number;
  sameMonthLastYearSpend: number;
  verdict: 'under' | 'on' | 'over';
};

export type QuickEntry = {
  parsed: {
    amount: number | null;
    description: string;
    date: string;
    kind: TransactionKind;
    accountId: string | null;
    accountName: string | null;
    toAccountId: string | null;
    toAccountName: string | null;
    categoryLabel: string | null;
    categoryColor: string | null;
    categorySource: 'explicit' | 'rule' | null;
  };
  missing: string[];
  ready: boolean;
  booked: Transaction | null;
  transferGroupId: string | null;
};

export type ImportRow = {
  line: number;
  date: string;
  description: string;
  rawDescription: string;
  amount: number;
  kind: TransactionKind;
  currency: string | null;
  categoryLabel: string | null;
  duplicate: boolean;
  duplicateOfId: string | null;
  currencyMismatch: boolean;
};

export type ImportPreview = {
  format: string;
  accountId: string;
  accountCurrency: string;
  rows: ImportRow[];
  newCount: number;
  duplicateCount: number;
  uncategorisedCount: number;
  warnings: string[];
  statementClosingBalance: number | null;
};

export type ImportCommit = {
  booked: number;
  skipped: { line: number; reason: string }[];
  transactions: Transaction[];
};

export type Statement = {
  month: string;
  from: string;
  to: string;
  baseCurrency: string;
  income: number;
  expense: number;
  net: number;
  savingsRate: number | null;
  previousIncome: number;
  previousExpense: number;
  byCategory: { label: string; amount: number; share: number; color: string | null }[];
  largest: { date: string; description: string | null; category: string | null; account: string | null; amount: number }[];
  budgets: { category: string; limit: number; spent: number; over: boolean }[];
  subscriptionsMonthly: number;
  accounts: { name: string; currency: string; balance: number; baseBalance: number; change: number }[];
  netWorth: number;
  netWorthChange: number;
  entryCount: number;
};

export type Preferences = {
  preferredCurrency: string;
  theme: 'system' | 'light' | 'dark';
  language: string;
  privacy: 'off' | 'balances' | 'all';
  appLock: boolean;
  lockDelaySeconds: number;
  timeframe: string;
};

export type FxRates = { base: string; rates: Record<string, number>; fetchedAt: string; stale: boolean };

export type Me = { id: string; username: string; email: string };

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Pulls the most useful line out of the backend's several error shapes. */
function messageFrom(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
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

type Options = { token?: string | null; body?: unknown; method?: string; raw?: boolean };

async function request<T>(path: string, opts: Options = {}): Promise<T> {
  const { token, body, method = body === undefined ? 'GET' : 'POST' } = opts;

  const res = await fetch(API_URL + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  if (opts.raw) {
    if (!res.ok) throw new ApiError(res.status, messageFrom(res.status, safeJson(text)));
    return text as unknown as T;
  }
  const parsed = text ? safeJson(text) : null;

  if (!res.ok) throw new ApiError(res.status, messageFrom(res.status, parsed));
  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

export const api = {
  // ---- session
  login: (email: string, password: string) =>
    request<{ token: string; email: string }>('/api/users/login', { body: { email, password } }),
  me: (token: string) => request<Me>('/api/users/validate', { token }),
  logout: (token: string) => request<void>('/api/users/logout', { token, method: 'POST', body: {} }),
  logoutEverywhere: (token: string) => request<void>('/api/users/logout-all', { token, method: 'POST', body: {} }),
  changePassword: (token: string, currentPassword: string, newPassword: string) =>
    request<{ token: string; email: string }>('/api/users/password', {
      token,
      body: { currentPassword, newPassword },
      method: 'PUT',
    }),
  preferences: (token: string) => request<Preferences>('/api/users/preferences', { token }),
  updatePreferences: (token: string, patch: Partial<Preferences>) =>
    request<Preferences>('/api/users/preferences', { token, body: patch, method: 'PUT' }),

  // ---- accounts
  accounts: (token: string) => request<Account[]>('/api/users/accounts/', { token }),
  createAccount: (token: string, accountName: string, currentBalance: number, currency = 'CHF') =>
    request<Account>('/api/users/accounts', { token, body: { accountName, currentBalance, currency } }),
  updateAccount: (token: string, id: string, patch: { accountName?: string; currentBalance?: number; currency?: string }) =>
    request<Account>(`/api/users/accounts/${id}`, { token, body: patch, method: 'PUT' }),
  deleteAccount: (token: string, id: string) =>
    request<void>(`/api/users/accounts/${id}`, { token, method: 'DELETE' }),
  reconcileAccount: (token: string, id: string, newBalance: number, note?: string | null) =>
    request<Transaction | null>(`/api/users/accounts/reconcile/${id}`, {
      token,
      body: { newBalance, note: note ?? null },
      method: 'PUT',
    }),

  // ---- categories
  categories: (token: string) => request<Category[]>('/api/category/user', { token }),
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
    request<TransactionPage>(`/api/transactions/search${qs(p as Record<string, string | number | undefined>)}`, { token }),
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
  budgetProgress: (token: string, date?: string) =>
    request<BudgetProgress[]>(`/api/budgets/progress${qs({ date })}`, { token }),
  createBudget: (token: string, input: { categoryLabel: string; maxAmount: number; period?: BudgetPeriod; rollover?: boolean; startDay?: number }) =>
    request<Budget>('/api/budgets', { token, body: input }),
  updateBudget: (token: string, id: string, patch: { limitAmount?: number; period?: BudgetPeriod; rollover?: boolean; startDay?: number }) =>
    request<Budget>(`/api/budgets/${id}`, { token, body: patch, method: 'PUT' }),
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
  bookPlanned: (token: string, id: string, date?: string) =>
    request<Planned>(`/api/planned/${id}/book${qs({ date })}`, { token, method: 'POST', body: {} }),
  upcoming: (token: string, days = 30, accountId?: string) =>
    request<Occurrence[]>(`/api/planned/upcoming${qs({ days, accountId })}`, { token }),
  safeToSpend: (token: string, accountId?: string) =>
    request<SafeToSpend>(`/api/planned/safe-to-spend${qs({ accountId })}`, { token }),

  // ---- goals
  goals: (token: string, includeInactive = false) => request<Goal[]>(`/api/goals${qs({ includeInactive })}`, { token }),
  createGoal: (
    token: string,
    input: { name: string; targetAmount: number; targetDate?: string | null; accountId?: string | null; savedAmount?: number | null; color?: string | null },
  ) => request<Goal>('/api/goals', { token, body: input }),
  updateGoal: (
    token: string,
    id: string,
    patch: { name?: string; targetAmount?: number; targetDate?: string | null; clearTargetDate?: boolean; accountId?: string | null; clearAccount?: boolean; savedAmount?: number; isActive?: boolean; color?: string },
  ) => request<Goal>(`/api/goals/${id}`, { token, body: patch, method: 'PUT' }),
  deleteGoal: (token: string, id: string) => request<void>(`/api/goals/${id}`, { token, method: 'DELETE' }),
  contributeGoal: (token: string, id: string, amount: number, fromAccountId?: string | null, note?: string | null) =>
    request<Goal>(`/api/goals/${id}/contribute`, { token, body: { amount, fromAccountId: fromAccountId ?? null, note: note ?? null } }),

  // ---- rules
  rules: (token: string) => request<Rule[]>('/api/rules', { token }),
  createRule: (token: string, input: { pattern: string; matchType?: MatchType; categoryLabel: string; accountId?: string | null; priority?: number }) =>
    request<Rule>('/api/rules', { token, body: input }),
  updateRule: (token: string, id: string, patch: { pattern?: string; matchType?: MatchType; categoryLabel?: string; accountId?: string | null; clearAccount?: boolean; priority?: number; isActive?: boolean }) =>
    request<Rule>(`/api/rules/${id}`, { token, body: patch, method: 'PUT' }),
  deleteRule: (token: string, id: string) => request<void>(`/api/rules/${id}`, { token, method: 'DELETE' }),
  testRule: (token: string, description: string, accountId?: string | null) =>
    request<{ rule: Rule | null; categoryLabel: string | null }>('/api/rules/test', { token, body: { description, accountId: accountId ?? null } }),
  applyRules: (token: string, dryRun: boolean, from?: string, to?: string) =>
    request<RuleApplyResult>(`/api/rules/apply${qs({ dryRun, from, to })}`, { token, method: 'POST', body: {} }),

  // ---- insights
  subscriptions: (token: string) => request<Subscriptions>('/api/insights/subscriptions', { token }),
  forecast: (token: string, date?: string) => request<Forecast>(`/api/insights/forecast${qs({ date })}`, { token }),
  fx: (token: string, base = 'CHF') => request<FxRates>(`/api/fx${qs({ base })}`, { token }),

  // ---- import / export
  importPreview: (token: string, accountId: string, csv: string, format = 'auto') =>
    request<ImportPreview>('/api/import/preview', { token, body: { accountId, csv, format } }),
  importCommit: (
    token: string,
    input: {
      accountId: string;
      rows: { line: number; date: string; description: string | null; amount: number; kind: TransactionKind; categoryLabel: string | null }[];
      defaultExpenseCategory?: string | null;
      defaultIncomeCategory?: string | null;
    },
  ) => request<ImportCommit>('/api/import/commit', { token, body: input }),
  exportCsv: (token: string, p: { from?: string; to?: string; accountId?: string }) =>
    request<string>(`/api/export/transactions.csv${qs(p)}`, { token, raw: true }),
  exportJson: (token: string, p: { from?: string; to?: string; accountId?: string }) =>
    request<Transaction[]>(`/api/export/transactions.json${qs(p)}`, { token }),

  // ---- statement
  statement: (token: string, month?: string) => request<Statement>(`/api/statement${qs({ month })}`, { token }),
  statementHtml: (token: string, month?: string) => request<string>(`/api/statement/html${qs({ month })}`, { token, raw: true }),
  mailStatus: (token: string) => request<{ configured: boolean }>('/api/statement/mail-status', { token }),
  sendStatement: (token: string, month?: string, to?: string) =>
    request<{ sentTo: string }>(`/api/statement/send${qs({ month, to })}`, { token, method: 'POST', body: {} }),
};
