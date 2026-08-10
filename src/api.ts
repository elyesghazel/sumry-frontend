/**
 * Thin typed client for the Sumry backend — the same contract the mobile app uses.
 *
 * VITE_API_URL lets a dev build point at a local backend; the deployed default is the
 * production API.
 */
export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://sumry-api.elyesghazel.ch';

export type CategoryType = 'INCOME' | 'EXPENSE';
export type TransactionKind = 'INCOME' | 'EXPENSE' | 'TRANSFER_IN' | 'TRANSFER_OUT';

export type Account = {
  id: string;
  userId: string | null;
  accountName: string;
  currentBalance: number;
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
};

export type Budget = {
  id: string;
  limitAmount: number;
  categoryLabel: string;
  categoryColor: string | null;
};

export type BudgetProgress = {
  categoryLabel: string;
  limitAmount: number;
  spentAmount: number;
  remaining: number;
  percentage: number;
};

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
  return `Request failed (${status})`;
}

type Options = { token?: string | null; body?: unknown; method?: string };

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

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; email: string }>('/api/users/login', { body: { email, password } }),

  register: (username: string, email: string, password: string) =>
    request<Me>('/api/users/register', { body: { username, email, password } }),

  me: (token: string) => request<Me>('/api/users/validate', { token }),

  accounts: (token: string) => request<Account[]>('/api/users/accounts/', { token }),

  createAccount: (token: string, accountName: string, currentBalance: number) =>
    request<Account>('/api/users/accounts', { token, body: { accountName, currentBalance } }),

  updateAccount: (token: string, id: string, patch: { accountName?: string; currentBalance?: number }) =>
    request<Account>(`/api/users/accounts/${id}`, { token, body: patch, method: 'PUT' }),

  deleteAccount: (token: string, id: string) =>
    request<void>(`/api/users/accounts/${id}`, { token, method: 'DELETE' }),

  reconcileAccount: (token: string, id: string, newBalance: number, note?: string | null) =>
    request<Transaction | null>(`/api/users/accounts/reconcile/${id}`, {
      token,
      body: { newBalance, note: note ?? null },
      method: 'PUT',
    }),

  changePassword: (token: string, currentPassword: string, newPassword: string) =>
    request<void>('/api/users/password', {
      token,
      body: { currentPassword, newPassword },
      method: 'PUT',
    }),

  categories: (token: string) => request<Category[]>('/api/category/user', { token }),

  // The backend identifies categories by label and takes it in the body, including on
  // DELETE, which is unusual but is the contract.
  deleteCategory: (token: string, label: string) =>
    request<void>('/api/category/label', { token, body: { label }, method: 'DELETE' }),

  createCategory: (
    token: string,
    input: {
      label: string;
      parentGroup?: string | null;
      color?: string | null;
      icon?: string | null;
      categoryType: CategoryType;
    },
  ) => request<Category>('/api/category/', { token, body: input }),

  updateCategory: (
    token: string,
    input: {
      label: string;
      newLabel?: string;
      parentGroup?: string | null;
      color?: string | null;
      icon?: string | null;
      categoryType?: CategoryType;
    },
  ) => request<Category>('/api/category/label', { token, body: input, method: 'PUT' }),

  transactions: (token: string) => request<Transaction[]>('/api/transactions/', { token }),

  createTransaction: (
    token: string,
    input: {
      amount: number;
      description?: string | null;
      categoryLabel: string;
      date: string;
      userAccountId: string;
    },
  ) => request<Transaction>('/api/transactions/', { token, body: input }),

  updateTransaction: (
    token: string,
    id: string,
    patch: {
      amount?: number;
      description?: string | null;
      categoryLabel?: string;
      date?: string;
      userAccountId?: string;
    },
  ) => request<Transaction>(`/api/transactions/${id}`, { token, body: patch, method: 'PUT' }),

  deleteTransaction: (token: string, id: string) =>
    request<void>(`/api/transactions/${id}`, { token, method: 'DELETE' }),

  createTransfer: (
    token: string,
    input: {
      amount: number;
      description?: string | null;
      fromAccountId: string;
      toAccountId: string;
      date: string;
    },
  ) => request<{ transferGroupId: string }>('/api/transactions/transfer', { token, body: input }),

  updateTransfer: (
    token: string,
    groupId: string,
    patch: {
      amount?: number;
      description?: string | null;
      fromAccountId?: string;
      toAccountId?: string;
      date?: string;
    },
  ) =>
    request<{ transferGroupId: string }>(`/api/transactions/transfer/${groupId}`, {
      token,
      body: patch,
      method: 'PUT',
    }),

  deleteTransfer: (token: string, groupId: string) =>
    request<void>(`/api/transactions/transfer/${groupId}`, { token, method: 'DELETE' }),

  budgets: (token: string) => request<Budget[]>('/api/budgets', { token }),

  budgetProgress: (token: string, month: number, year: number) =>
    request<BudgetProgress[]>(`/api/budgets/progress?month=${month}&year=${year}`, { token }),

  createBudget: (token: string, categoryLabel: string, maxAmount: number) =>
    request<Budget>('/api/budgets', { token, body: { categoryLabel, maxAmount } }),

  updateBudget: (token: string, id: string, limitAmount: number) =>
    request<Budget>(`/api/budgets/${id}`, { token, body: { limitAmount }, method: 'PUT' }),

  deleteBudget: (token: string, id: string) =>
    request<void>(`/api/budgets/${id}`, { token, method: 'DELETE' }),
};
