'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface DaySlots {
  date: string;
  slots: string[];
}

/**
 * Mobile-first date & time selector.
 * States: available / selected / unavailable (closed) / past. Unavailable is never selectable.
 */
export default function AvailabilityPicker({
  slug,
  serviceId,
}: {
  slug: string;
  serviceId: string;
}) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<DaySlots[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    fetch(
      `${API_URL}/api/v1/providers/${encodeURIComponent(slug)}/availability?serviceId=${serviceId}&date=${today}&days=${days}`,
      { cache: 'no-store' },
    )
      .then((r) => {
        if (!r.ok) throw new Error(`Availability request failed (${r.status})`);
        return r.json() as Promise<DaySlots[]>;
      })
      .then((d) => {
        if (!cancelled) setData(Array.isArray(d) ? d : []);
      })
      .catch(() => {
        if (!cancelled) setError('Availability is temporarily unavailable. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, serviceId, days, API_URL]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" role="status">
          {loading ? 'Loading live availability…' : selected ? `Selected: ${new Date(selected).toLocaleString('en-KE')}` : 'Choose a day, then a time.'}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Window</span>
          <select
            value={days}
            onChange={(e) => {
              setDays(Number(e.target.value));
              setSelected(null);
            }}
            className="h-10 rounded-md border border-input bg-background px-2.5"
          >
            <option value={7}>Next 7 days</option>
            <option value={14}>Next 14 days</option>
            <option value={30}>Next 30 days</option>
          </select>
        </label>
      </div>

      {loading && (
        <div className="mt-4 space-y-3" aria-label="Loading availability">
          <Skeleton className="h-4 w-40" />
          <div className="flex gap-2"><Skeleton className="h-9 w-20" /><Skeleton className="h-9 w-20" /><Skeleton className="h-9 w-20" /></div>
        </div>
      )}

      {error && !loading && (
        <div role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-card p-4 text-sm">
          <p className="font-medium">We couldn&apos;t load availability.</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setDays((d) => d)}>
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <p className="mt-4 rounded-lg border border-dashed bg-background p-4 text-sm text-muted-foreground">
          No availability configured yet for this window. Try a longer window or another service.
        </p>
      )}

      {!loading && !error && (
        <div className="mt-4 space-y-5">
          {data.map((day) => {
            const isPast = new Date(`${day.date}T23:59:59`) < new Date();
            return (
              <fieldset key={day.date} disabled={isPast}>
                <legend className="text-sm font-semibold">
                  {formatDay(day.date)}
                  {isPast && <span className="ml-2 font-normal text-muted-foreground">(past)</span>}
                </legend>
                {day.slots.length === 0 ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">{isPast ? 'Past' : 'Closed — no bookable times'}</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={`Times on ${formatDay(day.date)}`}>
                    {day.slots.map((slot) => {
                      const active = selected === slot;
                      return (
                        <button
                          key={slot}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setSelected(slot)}
                          className={`min-h-[44px] rounded-lg border px-3.5 text-sm font-medium transition-micro ${
                            active
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'bg-background hover:border-primary hover:text-primary'
                          }`}
                        >
                          {new Date(slot).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                        </button>
                      );
                    })}
                  </div>
                )}
              </fieldset>
            );
          })}
        </div>
      )}

      {selected && (
        <p className="mt-4 rounded-lg bg-muted p-3 text-sm">
          Selected: <strong>{new Date(selected).toLocaleString('en-KE')}</strong>. Continue below to review and pay — nothing is charged yet.
        </p>
      )}
    </div>
  );
}

function formatDay(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const label = d.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' });
  return sameDay ? `Today · ${label}` : label;
}
