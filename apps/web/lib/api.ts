import type { StatsSummary } from '@deluxe/shared';

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`API ${path} -> ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface Paged<T> {
  items: T[];
  total: number;
  take: number;
  skip: number;
}

export interface RedemptionRow {
  id: string;
  points: number;
  amountZar: string;
  currency: string;
  discountCode: string | null;
  status: string;
  issuedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  user?: { email: string | null; firstName: string | null; lastName: string | null };
}

export interface ActivityRow {
  id: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  category: string;
  message: string;
  context: unknown;
  createdAt: string;
}

export interface UserRow {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  shopifyCustomerId: string | null;
  zenotiGuestId: string | null;
  pointsBalance: number;
  lastSyncedAt: string | null;
}

export interface TrendPoint {
  date: string;
  count: number;
  zar: number;
  points: number;
}

export const api = {
  stats: () => get<StatsSummary>('/stats/summary'),
  trend: (days = 14) => get<TrendPoint[]>(`/stats/redemption-trend?days=${days}`),
  redemptions: (take = 50) => get<Paged<RedemptionRow>>(`/redemptions?take=${take}`),
  activity: (take = 100) => get<Paged<ActivityRow>>(`/activity?take=${take}`),
  users: (take = 100) => get<Paged<UserRow>>(`/users?take=${take}`),
};
