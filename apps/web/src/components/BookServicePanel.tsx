'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';

interface DaySlots {
  date: string;
  slots: string[];
}

export default function BookServicePanel({
  serviceId,
  slug,
  deliveryTypes,
  priceLabel,
  providerCity,
}: {
  serviceId: string;
  slug: string;
  deliveryTypes: string[];
  priceLabel: string;
  providerCity: string | null;
}) {
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [days, setDays] = useState(7);
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; id?: string } | null>(null);
  const [authChecked, setAuthChecked] = useState<boolean | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

  useEffect(() => {
    setAuthChecked(typeof window !== 'undefined' && !!window.localStorage.getItem('servana_access_token'));
  }, []);

  useEffect(() => {
    if (!selected) {
      setLoading(true);
      fetch(
        `${API_URL}/api/v1/providers/${encodeURIComponent(slug)}/availability?serviceId=${serviceId}&date=${date}&days=${days}`,
        { cache: 'no-store' },
      )
        .then((r) => (r.ok ? r.json() : []))
        .then((d: DaySlots[]) => setSlots(d.flatMap((day) => day.slots)))
        .finally(() => setLoading(false));
    }
  }, [slug, serviceId, date, days, API_URL, selected]);

  async function book() {
    if (!selected) return;
    setSubmitting(true);
    setResult(null);
    const deliveryType = deliveryTypes[0] ?? 'AT_PROVIDER_LOCATION';
    const res = await apiClient.post<{ id: string }>('/bookings', {
      providerServiceId: serviceId,
      startsAt: selected,
      deliveryType,
      address: deliveryType === 'AT_CUSTOMER_LOCATION' ? { city: providerCity ?? '' } : undefined,
    });
    setSubmitting(false);
    if (res.error) {
      setResult({ ok: false, message: res.error.message });
      return;
    }
    setResult({ ok: true, message: 'Booking requested! Awaiting provider confirmation.', id: (res.data as any)?.id });
  }

  if (authChecked === false) {
    return (
      <div className="rounded-lg border bg-card p-5 text-center shadow-soft">
        <p className="text-sm text-muted-foreground">Sign in to book this service.</p>
        <Link href="/login" className="mt-3 inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90">
          Sign in
        </Link>
      </div>
    );
  }

  if (result?.ok) {
    return (
      <div className="rounded-lg border bg-card p-5 text-center shadow-soft">
        <p className="text-sm font-medium text-emerald-700">{result.message}</p>
        <Link href="/bookings" className="mt-3 inline-flex h-10 items-center rounded-md border px-5 text-sm font-medium hover:bg-muted">
          View my bookings
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-5 shadow-soft">
      <p className="text-2xl font-bold">{priceLabel}</p>
      <p className="mt-1 text-xs text-muted-foreground">No payment is taken yet — bookings start in a pending state.</p>

      <div className="mt-4 flex flex-col gap-2 text-sm">
        <label className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Date</span>
          <input
            type="date"
            value={date}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => { setDate(e.target.value); setSelected(null); }}
            className="h-9 rounded-md border bg-background px-2"
          />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Window</span>
          <select value={days} onChange={(e) => { setDays(Number(e.target.value)); setSelected(null); }} className="h-9 rounded-md border bg-background px-2">
            <option value={7}>Next 7 days</option>
            <option value={14}>Next 14 days</option>
            <option value={30}>Next 30 days</option>
          </select>
        </label>
      </div>

      {loading && <p className="mt-3 text-sm text-muted-foreground">Loading availability…</p>}
      {!loading && slots.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">No available times in this window.</p>
      )}

      {!loading && slots.length > 0 && (
        <div className="mt-3 flex max-h-44 flex-wrap gap-2 overflow-auto">
          {slots.map((slot) => (
            <button
              key={slot}
              type="button"
              onClick={() => setSelected(slot)}
              className={`rounded-md border px-3 py-1.5 text-sm transition ${
                selected === slot ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:border-primary'
              }`}
            >
              {new Date(slot).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={!selected || submitting}
        onClick={book}
        className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? 'Booking…' : selected ? 'Request booking' : 'Select a time'}
      </button>

      {result && !result.ok && <p className="mt-2 text-center text-xs text-red-600">{result.message}</p>}
    </div>
  );
}
