'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export default function ThreadPage({ params }: { params: { id: string } }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const router = useRouter();

  const load = useCallback(async () => {
    const res = await apiClient.get<{ data: Message[] }>(`/conversations/${params.id}/messages?pageSize=50`);
    if (res.error) setError(res.error.message);
    else {
      const d = res.data as unknown as { data: Message[] } | Message[];
      setMessages(Array.isArray(d) ? d : d.data ?? []);
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    if (!draft.trim()) return;
    setError(null);
    const res = await apiClient.post<Message>(`/conversations/${params.id}/messages`, { body: draft });
    if (res.error) setError(res.error.message);
    else {
      setDraft('');
      load();
    }
  }

  async function report() {
    if (reportReason.trim().length < 5) {
      setError('Please describe the issue (min 5 characters).');
      return;
    }
    const res = await apiClient.post(`/conversations/${params.id}/report`, { reason: reportReason });
    if (res.error) setError(res.error.message);
    else {
      setReportOpen(false);
      setReportReason('');
      setError('Report submitted — our team will review this conversation.');
    }
  }

  if (loading) return <main className="mx-auto max-w-3xl px-4 py-10"><p className="text-sm text-muted-foreground">Loading thread…</p></main>;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <button onClick={() => router.back()} className="mb-4 text-sm text-primary underline">← Back</button>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Conversation</h1>
        <button onClick={() => setReportOpen((v) => !v)} className="text-xs text-muted-foreground underline">
          Report conversation
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {reportOpen && (
        <div className="mt-3 rounded-lg border border-red-200 p-3">
          <textarea
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            placeholder="What happened? Our team reviews every report."
            className="h-20 w-full rounded-md border px-3 py-2 text-sm"
          />
          <button onClick={report} className="mt-2 rounded-md bg-red-600 px-3 py-1.5 text-xs text-white">
            Submit report
          </button>
        </div>
      )}
      <ul className="mt-4 space-y-3">
        {messages.map((m) => (
          <li key={m.id} className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">
              {m.senderName} · {new Date(m.createdAt).toLocaleString()} {m.read ? '· read' : ''}
            </p>
            <p className="mt-1 text-sm">{m.body}</p>
          </li>
        ))}
      </ul>
      {messages.length === 0 && !error && (
        <p className="mt-4 text-sm text-muted-foreground">No messages yet — say hello.</p>
      )}
      <div className="mt-4 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Write a message…"
          maxLength={2000}
          className="h-10 flex-1 rounded-md border px-3 text-sm"
        />
        <button onClick={send} className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground">
          Send
        </button>
      </div>
    </main>
  );
}
