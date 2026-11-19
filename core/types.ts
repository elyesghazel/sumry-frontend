/**
 * Every shape the Sumry backend sends or accepts, shared by the web app and the phone app.
 * Field names follow the Kotlin DTOs under backend/src/main/kotlin; money arrives as numbers.
 */

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
  /** Counts toward safe-to-spend; off for savings. */
  spending: boolean;
  /** The balance in the user's base currency at today's rate. */
  baseBalance: number;
  baseCurrency: string;
  /**
   * When the balance was last checked against the bank (ISO datetime). Null = never;
   * undefined = a backend that does not report it yet.
   */
  lastReconciledAt?: string | null;
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
  /** Always positive; `kind` says which way it moves the balance. */
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
  /** The amount in the user's base currency — what reports add up. */
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

/** Income and expenses of one account in the current calendar month, base currency. */
export type Cashflow = { income: number; expenses: number };

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
  /** The accounts whose balance went into `balance` (the spending accounts by default). */
  accountIds: string[];
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

export type GoalInput = {
  name: string;
  targetAmount: number;
  targetDate?: string | null;
  accountId?: string | null;
  /** Starting point for an unlinked goal (money already set aside). */
  savedAmount?: number | null;
  color?: string | null;
  icon?: string | null;
};

export type GoalPatch = {
  name?: string;
  targetAmount?: number;
  targetDate?: string | null;
  clearTargetDate?: boolean;
  accountId?: string | null;
  clearAccount?: boolean;
  savedAmount?: number;
  isActive?: boolean;
  color?: string;
  icon?: string;
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

export type ImportFormat = 'auto' | 'postfinance' | 'revolut' | 'generic' | 'postfinance-pdf' | 'camt053';

/**
 * Either `csv` (text) or `fileBase64` + `fileName` (a PDF or camt.053 XML statement).
 * The file path needs the statement-upload backend; the csv path works everywhere.
 */
export type ImportPreviewInput = {
  accountId: string;
  format?: ImportFormat | string;
  csv?: string;
  fileBase64?: string;
  fileName?: string;
};

export type ImportRow = {
  line: number;
  date: string;
  /** IBANs in here arrive masked. */
  description: string;
  rawDescription: string;
  amount: number;
  kind: TransactionKind;
  currency: string | null;
  categoryLabel: string | null;
  duplicate: boolean;
  duplicateOfId: string | null;
  currencyMismatch: boolean;
  /** Entries this row matched: one, or several when the row is their sum. */
  matchIds?: string[];
  matchKind?: 'same-day' | 'near' | 'split' | null;
  /** "Kebab · 9 Oct", or "Top-up 100 + Fee 0.35 · 2 Oct" for a split. */
  matchNote?: string | null;
  /** The bank's booking day when `date` is the earlier purchase day. */
  bookingDate?: string | null;
};

export type ImportPreview = {
  format: string;
  accountId: string;
  accountCurrency: string;
  rows: ImportRow[];
  newCount: number;
  duplicateCount: number;
  uncategorisedCount: number;
  /** May include a redacted diagnostics block when a statement could not be parsed. */
  warnings: string[];
  statementClosingBalance: number | null;
  /** Statement period (ISO dates) and opening balance, when the file states them. */
  statementFrom?: string | null;
  statementTo?: string | null;
  statementOpeningBalance?: number | null;
  /** Opening plus every row; equals the closing balance when nothing was misread. */
  computedClosingBalance?: number | null;
  /** true: rows add up to the closing balance, false: they don't, null: no balances in the file. */
  balanceOk?: boolean | null;
  /** The server can ask Claude about unmatched rows (POST /api/import/check). */
  aiCheckAvailable?: boolean;
};

export type ImportCheckInput = {
  accountId: string;
  rows: { line: number; date: string; bookingDate?: string | null; description: string; amount: number; kind: TransactionKind }[];
  matchedIds?: string[];
  statementFrom?: string | null;
  statementTo?: string | null;
};

export type ImportCheckSuggestion = {
  line: number;
  verdict: 'logged' | 'new' | 'suspicious';
  matchIds: string[];
  categoryLabel: string | null;
  reason: string;
};

export type ImportCheck = {
  suggestions: ImportCheckSuggestion[];
  /** Hand-made reconcile adjustments ("Abgleich") the new rows would count twice. */
  adjustments: { id: string; note: string }[];
  summary: string;
};

export type ImportCommitInput = {
  accountId: string;
  rows: { line: number; date: string; description: string | null; amount: number; kind: TransactionKind; categoryLabel: string | null }[];
  defaultExpenseCategory?: string | null;
  defaultIncomeCategory?: string | null;
};

export type ImportCommit = {
  booked: number;
  skipped: { line: number; reason: string }[];
  transactions: Transaction[];
};

export type ExportParams = { from?: string; to?: string; accountId?: string };

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

/** Account-level settings stored on the server (device-only settings stay local). */
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

export type Session = { token: string; email: string };

export type ShortcutToken = { token: string; expiresAt: string };

// ---- plan (GET /api/users/me)

export type Plan = 'FREE' | 'PREMIUM';

/** The `limit` field of a 403 `{"error":"plan_limit"}` response. */
export type PlanLimitName = 'accounts' | 'statement_import' | 'statement_email';

/** What the effective plan allows. `maxAccounts: null` = unlimited. */
export type PlanLimits = {
  maxAccounts: number | null;
  statementImport: boolean;
  statementEmail: boolean;
};

/**
 * GET /api/users/me: the user plus what this instance lets them do. With
 * `limitsEnabled: false` (self-hosted default) the plan is always PREMIUM.
 */
export type Profile = Me & {
  plan: Plan;
  limitsEnabled: boolean;
  limits: PlanLimits;
  /** On the AI allowlist and the Claude bridge is configured. */
  aiEnabled: boolean;
};
