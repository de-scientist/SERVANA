'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';

interface Conversation {
  id: string;
  bookingId: string | null;
  latestMessage: { body: string; senderName: string; createdAt: string } | null;
  unreadCount: number;
  createdAt: string;
}

export default function MessagesPage() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<Conversation[]>('/conversations/mine')
      .then((res) => {
        if (res.error) setError(res.error.message);
        else setItems((res.data as Conversation[]) ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <main className="mx-auto max-w-3xl px-4 py-10"><p className="text-sm text-muted-foreground">Loading messages…</p></main>;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">Messages</h1>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {items.length === 0 && !error && (
        <p className="mt-4 text-sm text-muted-foreground">
          No conversations yet. Message threads open automatically around your bookings — contact details stay private.
        </p>
      )}
      <ul className="mt-4 space-y-3">
        {items.map((c) => (
          <li key={c.id}>
            <Link href={`/messages/${c.id}`} className="block rounded-lg border bg-card p-4 hover:border-primary">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Booking {c.bookingId?.slice(0, 8) ?? '—'}</p>
                {c.unreadCount > 0 && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{c.unreadCount} new</span>
                )}
              </div>
              <p className="mt-1 truncate text-sm">
                {c.latestMessage ? `${c.latestMessage.senderName}: ${c.latestMessage.body}` : 'No messages yet — say hello.'}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
