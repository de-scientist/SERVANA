'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

interface Notice {
  id: string;
  channel: string;
  subject: string | null;
  body: string;
  status: string;
  read: boolean;
  createdAt: string;
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(onlyUnread: boolean) {
    setLoading(true);
    setError(null);
    const res = await apiClient.get<{ data: Notice[]; meta: { unread: number } }>(
      `/notifications${onlyUnread ? '?unreadOnly=true' : ''}`,
    );
    if (res.error) setError(res.error.message);
    else {
      const d = res.data as unknown as { data: Notice[]; meta: { unread: number } };
      // apiClient unwraps outer { data }; inbox returns { data, meta }.
      const payload = (d as { data?: Notice[] }).data ?? (d as unknown as Notice[]);
      setItems(Array.isArray(payload) ? payload : []);
      setUnread(d.meta?.unread ?? 0);
    }
    setLoading(false);
  }

  useEffect(() => {
    load(unreadOnly);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadOnly]);

  async function markRead(id: string) {
    await apiClient.patch(`/notifications/${id}/read`, {});
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
  }

  async function markAll() {
    await apiClient.post('/notifications/read-all', {});
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notifications {unread > 0 && <span className="text-base text-muted-foreground">({unread} unread)</span>}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setUnreadOnly((v) => !v)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${unreadOnly ? 'bg-primary text-primary-foreground' : 'border'}`}
          >
            Unread only
          </button>
          <button onClick={markAll} className="rounded-full border px-3 py-1 text-xs font-medium">
            Mark all read
          </button>
        </div>
      </div>
      {loading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {!loading && items.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">You&apos;re all caught up. Booking and payment updates land here.</p>
      )}
      <ul className="mt-4 space-y-3">
        {items.map((n) => (
          <li key={n.id} className={`rounded-lg border bg-card p-4 ${n.read ? 'opacity-70' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                {n.subject && <p className="font-medium">{n.subject}</p>}
                <p className="text-sm">{n.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {n.channel} · {new Date(n.createdAt).toLocaleString()}
                </p>
              </div>
              {!n.read && (
                <button onClick={() => markRead(n.id)} className="shrink-0 rounded-md border px-2 py-1 text-xs">
                  Mark read
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
