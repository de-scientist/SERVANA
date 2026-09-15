'use client';

import { useEffect, useState } from 'react';

interface DaySlots {
  date: string;
  slots: string[];
}

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
  const [selected, setSelected] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

  useEffect(() => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    fetch(
      `${API_URL}/api/v1/providers/${encodeURIComponent(slug)}/availability?serviceId=${serviceId}&date=${today}&days=${days}`,
      { cache: 'no-store' },
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((d: DaySlots[]) => setData(d))
      .finally(() => setLoading(false));
  }, [slug, serviceId, days, API_URL]);

  const todayLabel = new Date().toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Available times</h3>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="h-9 rounded-md border bg-card px-2 text-sm"
        >
          <option value={7}>Next 7 days</option>
          <option value={14}>Next 14 days</option>
          <option value={30}>Next 30 days</option>
        </select>
      </div>

      {loading && <p className="mt-3 text-sm text-muted-foreground">Loading availability…</p>}

      {!loading && data.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">No availability configured yet.</p>
      )}

      <div className="mt-4 space-y-5">
        {data.map((day) => (
          <div key={day.date}>
            <p className="text-sm font-medium text-muted-foreground">
              {formatDay(day.date, todayLabel)}
            </p>
            {day.slots.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">Closed</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {day.slots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelected(slot)}
                    className={`rounded-md border px-3 py-1.5 text-sm transition ${
                      selected === slot
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'bg-card hover:border-primary'
                    }`}
                  >
                    {new Date(slot).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {selected && (
        <p className="mt-4 rounded-md bg-muted p-3 text-sm">
          Selected: <strong>{new Date(selected).toLocaleString('en-KE')}</strong>. Booking opens soon — this is a demo of
          dynamic slot generation.
        </p>
      )}
    </div>
  );
}

function formatDay(date: string, todayLabel: string): string {
  const d = new Date(date + 'T00:00:00');
  const label = d.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' });
  return label === todayLabel ? `Today` : label;
}
