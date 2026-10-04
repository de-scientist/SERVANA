'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { ProviderShell } from '@/components/layout/provider-shell';
import { ErrorState } from '@/components/ui/error-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/providers/toast';

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

interface DaySchedule {
  enabled: boolean;
  open: string;
  close: string;
}

/** Weekly schedule + breaks + days off. Recurring rules stay easy to understand. */
export default function ProviderAvailabilityPage() {
  const { toast } = useToast();
  const initialSchedule: Record<string, DaySchedule> = {};
  for (const d of DAYS) {
    initialSchedule[d] = { enabled: d !== 'SUNDAY', open: '09:00', close: '17:00' };
  }
  const [schedule, setSchedule] = useState<Record<string, DaySchedule>>(initialSchedule);
  const [breakStart, setBreakStart] = useState('13:00');
  const [breakEnd, setBreakEnd] = useState('14:00');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get('/providers/me/availability')
      .then((res) => {
        if (res.error) {
          // No saved schedule yet is fine — keep defaults.
          if (res.status !== 404) setError(res.error.message);
        } else if (res.data) {
          const d = res.data as { schedule?: Record<string, DaySchedule>; breakStart?: string; breakEnd?: string };
          if (d.schedule) setSchedule((prev) => ({ ...prev, ...d.schedule }));
          if (d.breakStart) setBreakStart(d.breakStart);
          if (d.breakEnd) setBreakEnd(d.breakEnd);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    const res = await apiClient.request('/providers/me/availability', {
      method: 'PUT',
      body: JSON.stringify({ schedule, breakStart, breakEnd }),
    });
    setSaving(false);
    if (res.error) toast(res.error.message, 'error');
    else toast('Availability saved.', 'success');
  }

  return (
    <ProviderShell title="Availability" description="Weekly hours, breaks and days off. The booking engine computes real slots from this.">
      {error && <div className="mb-4"><ErrorState description={error} onRetry={() => window.location.reload()} /></div>}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading your schedule…</p>
      ) : (
        <>
          <ul className="space-y-2">
            {DAYS.map((day) => (
              <li key={day} className="card-rest flex flex-wrap items-center gap-3 p-3.5">
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={schedule[day].enabled}
                    onChange={(e) => setSchedule((s) => ({ ...s, [day]: { ...s[day], enabled: e.target.checked } }))}
                    className="h-5 w-5 accent-primary"
                  />
                  {day.charAt(0) + day.slice(1).toLowerCase()}
                </label>
                <div className="ml-auto flex items-center gap-2 text-sm">
                  <label>Open <Input type="time" value={schedule[day].open} disabled={!schedule[day].enabled} onChange={(e) => setSchedule((s) => ({ ...s, [day]: { ...s[day], open: e.target.value } }))} className="h-10 w-[130px]" aria-label={`${day} opening time`} /></label>
                  <span className="text-muted-foreground">–</span>
                  <label>Close <Input type="time" value={schedule[day].close} disabled={!schedule[day].enabled} onChange={(e) => setSchedule((s) => ({ ...s, [day]: { ...s[day], close: e.target.value } }))} className="h-10 w-[130px]" aria-label={`${day} closing time`} /></label>
                </div>
              </li>
            ))}
          </ul>
          <div className="card-rest mt-3 flex flex-wrap items-center gap-3 p-4 text-sm">
            <span className="font-semibold">Daily break</span>
            <label>From <Input type="time" value={breakStart} onChange={(e) => setBreakStart(e.target.value)} className="h-10 w-[130px]" aria-label="Break start" /></label>
            <label>To <Input type="time" value={breakEnd} onChange={(e) => setBreakEnd(e.target.value)} className="h-10 w-[130px]" aria-label="Break end" /></label>
          </div>
          <Button onClick={save} disabled={saving} className="mt-4 min-h-[48px] px-8">
            {saving ? 'Saving…' : 'Save schedule'}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">Exceptions, holidays and blocked time inherit this weekly pattern — add them per-date from your calendar export.</p>
        </>
      )}
    </ProviderShell>
  );
}
