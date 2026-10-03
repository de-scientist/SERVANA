'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { ProviderShell } from '@/components/layout/provider-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/providers/toast';

/** AI workspace — Generate → Edit → Approve → Publish. Never auto-publishes. */
const TONES = ['Professional', 'Friendly', 'Luxury', 'Playful', 'Minimal'] as const;

export default function ProviderAIPage() {
  const { toast } = useToast();
  const [kind, setKind] = useState('service-description');
  const [tone, setTone] = useState<(typeof TONES)[number]>('Professional');
  const [brief, setBrief] = useState('');
  const [draft, setDraft] = useState<string | null>(null);
  const [edited, setEdited] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!brief.trim()) {
      toast('Describe what you need first.', 'error');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await apiClient.post<{ draft?: string; text?: string }>('/ai/marketing/draft', {
      kind,
      tone: tone.toLowerCase(),
      brief: brief.trim(),
    });
    setBusy(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    const text = (res.data as { draft?: string; text?: string })?.draft ?? (res.data as { text?: string })?.text ?? '';
    setDraft(text);
    setEdited(text);
  }

  return (
    <ProviderShell title="AI tools" description="Drafts you review and approve — AI assists, you publish. AI-generated content is always labelled.">
      {error && <p role="alert" className="mb-4 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card-rest space-y-3 p-5" aria-labelledby="gen-h">
          <h2 id="gen-h" className="font-semibold">Generate</h2>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Tool</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="h-11 rounded-md border border-input bg-background px-3">
              <option value="service-description">Service description</option>
              <option value="promotion">Promotion / offer</option>
              <option value="social-caption">Instagram / TikTok caption</option>
              <option value="follow-up">Customer follow-up message</option>
            </select>
          </label>
          <fieldset>
            <legend className="text-sm font-medium">Tone</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {TONES.map((t) => (
                <label key={t} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-micro ${tone === t ? 'border-primary bg-primary/5 text-primary' : ''}`}>
                  <input type="radio" name="tone" value={t} checked={tone === t} onChange={() => setTone(t)} className="sr-only" />
                  {t}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Brief</span>
            <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={4} placeholder="e.g. Box braids, 3h, includes wash, Kilimani, weekend slots…" className="rounded-md border border-input bg-background p-2.5" />
          </label>
          <Button onClick={generate} disabled={busy} className="min-h-[48px] w-full">{busy ? 'Generating…' : 'Generate draft'}</Button>
        </section>

        <section className="card-rest p-5" aria-labelledby="review-h" aria-live="polite">
          <h2 id="review-h" className="font-semibold">Edit &amp; approve</h2>
          {!draft ? (
            <p className="mt-2 text-sm text-muted-foreground">Your draft will appear here for editing. Nothing publishes automatically.</p>
          ) : (
            <>
              <p className="mt-2 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">AI-generated — review before use</p>
              <textarea value={edited} onChange={(e) => setEdited(e.target.value)} rows={10} className="mt-2 w-full rounded-md border border-input bg-background p-2.5 text-sm" aria-label="Edit AI draft" />
              <div className="mt-3 flex gap-2">
                <Button onClick={() => { navigator.clipboard?.writeText(edited).catch(() => undefined); toast('Copied — paste wherever you publish.', 'success'); }}>Approve &amp; copy</Button>
                <Button variant="outline" onClick={() => { setDraft(null); setEdited(''); }}>Discard</Button>
              </div>
            </>
          )}
        </section>
      </div>

      <section className="card-rest mt-4 p-5 text-sm" aria-label="Review insights">
        <h2 className="font-semibold">Review insights</h2>
        <p className="mt-1 text-muted-foreground">Strengths and improvements computed from your verified reviews — see <a href="/provider/performance" className="text-primary hover:underline">Performance</a>.</p>
      </section>
    </ProviderShell>
  );
}
