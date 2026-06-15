const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export type User = { id: number; name: string; email: string; reply_prompt?: string };

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function setToken(token: string) {
  localStorage.setItem('token', token);
  authRedirectPending = false;
}

export function clearToken() {
  localStorage.removeItem('token');
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let authRedirectPending = false;

function handleUnauthorized() {
  clearToken();
  if (typeof window === 'undefined' || authRedirectPending) return;
  const path = window.location.pathname;
  if (path === '/login' || path === '/register') return;
  authRedirectPending = true;
  window.location.href = '/login?expired=1';
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    if (res.status === 401) {
      handleUnauthorized();
    }
    const err = await res.json().catch(() => ({ message: res.statusText }));
    const hint = err.hint ? ` ${err.hint}` : '';
    throw new ApiError((err.message || err.error || 'Request failed') + hint, res.status);
  }

  return res.json();
}

const WELCOME_PENDING_KEY = 'revreply_welcome_pending';

export function markWelcomePending(options?: { isNewUser?: boolean }) {
  sessionStorage.setItem(WELCOME_PENDING_KEY, options?.isNewUser ? 'new' : 'returning');
}

export function consumeWelcomePending(): 'new' | 'returning' | false {
  if (typeof window === 'undefined') return false;
  const value = sessionStorage.getItem(WELCOME_PENDING_KEY);
  if (!value) return false;
  sessionStorage.removeItem(WELCOME_PENDING_KEY);
  return value === 'new' ? 'new' : 'returning';
}

export const auth = {
  register: (data: { name: string; email: string; password: string; password_confirmation: string }) =>
    api<{ user: User; token: string }>('/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    api<{ user: User; token: string }>('/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => api<User>('/me'),
  logout: () => api('/logout', { method: 'POST' }),
};

export const gmail = {
  status: () => api<{ oauth_configured: boolean; pubsub_configured: boolean; redirect_uri: string }>('/gmail/status'),
  connect: () => api<{ url: string; configured: boolean }>('/gmail/connect'),
  accounts: () => api<{ data: GmailAccount[] }>('/gmail/accounts'),
  disconnect: (id: number) => api(`/gmail/accounts/${id}`, { method: 'DELETE' }),
  sync: (id: number) => api<{ message: string }>(`/gmail/accounts/${id}/sync`, { method: 'POST' }),
  syncAll: () => api<{ message: string; synced: number }>('/gmail/accounts/sync-all', { method: 'POST' }),
};

export type ThreadListParams = {
  page?: number;
  filter?: 'all' | 'needs_review' | 'sent';
  label?: string;
  mailbox?: number;
  mailbox_q?: string;
  q?: string;
};

function threadQueryString(params: ThreadListParams = {}) {
  const sp = new URLSearchParams();
  if (params.page && params.page > 1) sp.set('page', String(params.page));
  if (params.filter && params.filter !== 'all') sp.set('filter', params.filter);
  if (params.label && params.label !== 'all') sp.set('label', params.label);
  if (params.mailbox) sp.set('mailbox', String(params.mailbox));
  if (params.mailbox_q?.trim()) sp.set('mailbox_q', params.mailbox_q.trim());
  if (params.q?.trim()) sp.set('q', params.q.trim());
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export const threads = {
  count: () => api<{ total: number }>('/threads/count'),
  list: (params: ThreadListParams = {}) =>
    api<Paginated<Thread>>(`/threads${threadQueryString(params)}`),
  show: (id: number) => api<Thread>(`/threads/${id}`),
  markSeen: (id: number) => api<{ notification_state: 1 }>(`/threads/${id}/seen`, { method: 'POST' }),
  setNotificationState: (id: number, state: 0 | 1) =>
    api<{ notification_state: 0 | 1 }>(`/threads/${id}/notification-state`, {
      method: 'POST',
      body: JSON.stringify({ state }),
    }),
  message: (id: number) => api<Message>(`/messages/${id}`),
  generateDraft: (messageId: number) =>
    api<Message>(`/messages/${messageId}/generate-draft`, { method: 'POST' }),
  processMessage: (messageId: number) =>
    api<Message>(`/messages/${messageId}/process`, { method: 'POST' }),
};

export const drafts = {
  approve: (id: number, body?: string) =>
    api<DraftReply>(`/drafts/${id}/approve`, { method: 'POST', body: JSON.stringify({ body }) }),
  reject: (id: number) => api<DraftReply>(`/drafts/${id}/reject`, { method: 'POST' }),
};

export type AppNotification = {
  id: string;
  type: 'needs_review' | 'sent';
  title: string;
  body: string;
  thread_id: number;
  created_at: string;
};

export const notifications = {
  list: () => api<{ data: AppNotification[] }>('/notifications'),
  markAllRead: () => api<{ message: string }>('/notifications/read-all', { method: 'POST' }),
};

export const settings = {
  get: () =>
    api<{ reply_prompt: string; llm_driver: string; llm_model: string }>('/settings'),
  updateReplyPrompt: (reply_prompt: string) =>
    api<{ message: string; reply_prompt: string }>('/settings/reply-prompt', {
      method: 'PUT',
      body: JSON.stringify({ reply_prompt }),
    }),
};

export type GmailAccount = {
  id: number;
  gmail_email: string;
  status: string;
  status_label?: string;
  last_history_id: string | null;
  watch_expires_at: string | null;
  connected_at?: string;
  created_at: string;
  updated_at?: string;
  messages_count?: number;
};

export type Classification = {
  id: number;
  label: string;
  confidence: number;
  model: string;
  extracted_keywords?: string[];
};

export type DraftReply = {
  id: number;
  body: string;
  status: string;
  gmail_draft_id: string | null;
  approved_at: string | null;
};

export type Message = {
  id: number;
  from_email: string;
  subject: string;
  body_text: string;
  received_at: string;
  classification?: Classification;
  draft_reply?: DraftReply;
};

export type Thread = {
  id: number;
  subject: string;
  snippet: string;
  last_message_at: string;
  notification_state?: 0 | 1;
  gmail_account?: GmailAccount;
  messages?: Message[];
};

export type Paginated<T> = {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
};
