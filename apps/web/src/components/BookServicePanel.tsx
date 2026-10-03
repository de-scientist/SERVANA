'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface DaySlots {
  date: string;
  slots: string[];
}

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Service' },
  { n: 2, label: 'Date & time' },
  { n: 3, label: 'Details' },
  { n: 4, label: 'Review' },
  { n: 5, label: 'Payment' },
  { n: 6, label: 'Done' },
];

/**
 * Multi-step booking: Service → Date & time → Details → Review → Payment → Confirmation.
 * Payment success is ONLY shown after the backend confirms it (GET /payments/:id).
 */
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
  const [step, setStep] = useState<Step>(1);
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [days] = useState(14);
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [deliveryType, setDeliveryType] = useState(deliveryTypes[0] ?? 'AT_PROVIDER_LOCATION');
  const [address, setAddress] = useState(providerCity ?? '');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'MPESA' | 'CARD' | 'BANK' | 'OTHER'>('MPESA');
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState<boolean | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

  useEffect(() => {
    setAuthChecked(typeof window !== 'undefined' && !!window.localStorage.getItem('servana_access_token'));
  }, []);

  useEffect(() => {
    if (step !== 2) return;
    setLoadingSlots(true);
    setSlotsError(null);
    fetch(
      `${API_URL}/api/v1/providers/${encodeURIComponent(slug)}/availability?serviceId=${serviceId}&date=${date}&days=${days}`,
      { cache: 'no-store' },
    )
      .then((r) => {
        if (!r.ok) throw new Error('availability failed');
        return r.json() as Promise<DaySlots[]>;
      })
      .then((d) => setSlots(d.flatMap((day) => day.slots)))
      .catch(() => setSlotsError('Availability is temporarily unavailable. Please try again.'))
      .finally(() => setLoadingSlots(false));
  }, [slug, serviceId, date, days, API_URL, step]);

  const canContinueFromDetails = useMemo(() => {
    if (deliveryType === 'AT_CUSTOMER_LOCATION') return address.trim().length > 1;
    return true;
  }, [deliveryType, address]);

  async function createBooking() {
    if (!selected) return;
    setSubmitting(true);
    setResultError(null);
    const res = await apiClient.post<{ id: string }>('/bookings', {
      providerServiceId: serviceId,
      startsAt: selected,
      deliveryType,
      address: deliveryType === 'AT_CUSTOMER_LOCATION' ? { city: address.trim() } : undefined,
      notes: notes.trim() || undefined,
    });
    setSubmitting(false);
    if (res.error) {
      setResultError(res.error.message);
      return;
    }
    const id = (res.data as { id: string } | undefined)?.id ?? null;
    setBookingId(id);
    setStep(5);
  }

  async function initiatePayment() {
    if (!bookingId) return;
    setSubmitting(true);
    setPaymentError(null);
    const res = await apiClient.post<{ id: string; status?: string }>(`/payments`, {
      bookingId,
      method: paymentMethod,
    });
    if (res.error) {
      setSubmitting(false);
      setPaymentError(res.error.message);
      return;
    }
    const paymentId = (res.data as { id: string } | undefined)?.id;
    // Verify with backend — never trust initiation alone.
    if (paymentId) {
      const check = await apiClient.get<{ status: string }>(`/payments/${paymentId}`);
      if (!check.error && check.data) {
        setPaymentStatus((check.data as { status: string }).status);
      } else {
        setPaymentStatus('PENDING');
      }
    } else {
      setPaymentStatus('PENDING');
    }
    setSubmitting(false);
    setStep(6);
  }

  if (authChecked === false) {
    return (
      <div className="rounded-xl border bg-card p-5 text-center">
        <p className="type-h4">Sign in to book</p>
        <p className="mt-1 text-sm text-muted-foreground">Bookings require an account so we can confirm payment securely.</p>
        <Button asChild className="mt-4 min-h-[48px] w-full">
          <Link href="/login">Sign in</Link>
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          New here? <Link href="/register" className="text-primary hover:underline">Create an account</Link>
        </p>
      </div>
    );
  }

  return (
    <div id="book-panel">
      <ol className="flex items-center gap-1 text-[11px] font-medium" aria-label="Booking progress">
        {STEPS.map((s, i) => (
          <li key={s.n} className="flex flex-1 items-center gap-1">
            <span
              aria-current={step === s.n ? 'step' : undefined}
              className={`flex h-6 w-6 items-center justify-center rounded-full ${step >= s.n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
            >
              {s.n}
            </span>
            <span className={`hidden sm:inline ${step === s.n ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px flex-1 bg-border" aria-hidden />}
          </li>
        ))}
      </ol>

      <p className="mt-4 text-2xl font-bold tabular-nums">{priceLabel}</p>
      <p className="mt-1 text-xs text-muted-foreground">No payment is taken until you confirm at step 5 — and success is backend-verified.</p>

      {step === 1 && (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">You&apos;re booking this service. Continue to pick a real available time.</p>
          <Button onClick={() => setStep(2)} className="mt-3 min-h-[48px] w-full">Continue · choose time</Button>
        </div>
      )}

      {step === 2 && (
        <div className="mt-4">
          <label className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Start date</span>
            <Input
              type="date"
              value={date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => {
                setDate(e.target.value);
                setSelected(null);
              }}
              className="h-11 w-auto"
            />
          </label>
          {loadingSlots && <p className="mt-3 text-sm text-muted-foreground" role="status">Loading availability…</p>}
          {slotsError && <p className="mt-3 text-sm text-destructive" role="alert">{slotsError}</p>}
          {!loadingSlots && !slotsError && slots.length === 0 && (
            <p className="mt-3 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              No available times from this date. Try an earlier date.
            </p>
          )}
          {!loadingSlots && slots.length > 0 && (
            <div className="mt-3 grid max-h-48 grid-cols-3 gap-2 overflow-auto" role="radiogroup" aria-label="Available times">
              {slots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  role="radio"
                  aria-checked={selected === slot}
                  onClick={() => setSelected(slot)}
                  className={`min-h-[44px] rounded-lg border text-sm font-medium transition-micro ${
                    selected === slot ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:border-primary'
                  }`}
                >
                  {new Date(slot).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                </button>
              ))}
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)} className="min-h-[44px]">Back</Button>
            <Button onClick={() => setStep(3)} disabled={!selected} className="min-h-[44px] flex-1">
              {selected ? 'Continue · details' : 'Select a time'}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mt-4 space-y-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Where should the service happen?</span>
            <select
              value={deliveryType}
              onChange={(e) => setDeliveryType(e.target.value)}
              className="h-11 rounded-md border border-input bg-background px-3"
            >
              {deliveryTypes.map((d) => (
                <option key={d} value={d}>{d.replace(/_/g, ' ').toLowerCase()}</option>
              ))}
            </select>
          </label>
          {deliveryType === 'AT_CUSTOMER_LOCATION' && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Your area / city</span>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Kilimani, Nairobi" />
            </label>
          )}
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Notes for the provider <span className="font-normal text-muted-foreground">(optional)</span></span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Allergies, inspiration links, access details…"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)} className="min-h-[44px]">Back</Button>
            <Button onClick={() => setStep(4)} disabled={!canContinueFromDetails} className="min-h-[44px] flex-1">
              Review booking
            </Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="mt-4 rounded-xl border bg-muted/40 p-4 text-sm">
          <h3 className="font-semibold">Review before payment</h3>
          <dl className="mt-2 space-y-1.5">
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">When</dt><dd className="text-right font-medium">{selected ? new Date(selected).toLocaleString('en-KE') : '—'}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Where</dt><dd className="text-right font-medium">{deliveryType.replace(/_/g, ' ').toLowerCase()}{deliveryType === 'AT_CUSTOMER_LOCATION' ? ` · ${address}` : ''}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Service price</dt><dd className="font-semibold">{priceLabel}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Fees &amp; discounts</dt><dd>Shown at payment</dd></div>
          </dl>
          {resultError && <p className="mt-2 text-destructive" role="alert">{resultError}</p>}
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => setStep(3)} className="min-h-[44px]">Back</Button>
            <Button onClick={createBooking} disabled={submitting} className="min-h-[44px] flex-1">
              {submitting ? 'Creating booking…' : 'Confirm details · pay next'}
            </Button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="mt-4">
          <h3 className="font-semibold">Payment</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Booking <span className="font-mono">{bookingId?.slice(0, 8) ?? ''}</span> is reserved as pending. Complete payment — we only confirm after the backend verifies it.
          </p>
          <fieldset className="mt-3 grid grid-cols-2 gap-2">
            <legend className="sr-only">Payment method</legend>
            {(['MPESA', 'CARD', 'BANK', 'OTHER'] as const).map((m) => (
              <label
                key={m}
                className={`flex min-h-[48px] cursor-pointer items-center justify-center rounded-lg border text-sm font-medium transition-micro ${paymentMethod === m ? 'border-primary bg-primary/5 text-primary' : 'hover:border-primary/50'}`}
              >
                <input type="radio" name="pay-method" value={m} checked={paymentMethod === m} onChange={() => setPaymentMethod(m)} className="sr-only" />
                {m === 'MPESA' ? 'M-Pesa' : m.charAt(0) + m.slice(1).toLowerCase()}
              </label>
            ))}
          </fieldset>
          {paymentMethod === 'MPESA' && (
            <p className="mt-2 text-xs text-muted-foreground">You&apos;ll receive an M-Pesa prompt on your phone. Enter your PIN to authorise.</p>
          )}
          {paymentError && <p className="mt-2 text-sm text-destructive" role="alert">{paymentError}</p>}
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => setStep(4)} className="min-h-[44px]">Back</Button>
            <Button onClick={initiatePayment} disabled={submitting || !bookingId} className="min-h-[48px] flex-1">
              {submitting ? 'Processing…' : `Pay ${priceLabel}`}
            </Button>
          </div>
        </div>
      )}

      {step === 6 && (
        <div className="mt-4 rounded-xl border bg-card p-5 text-center" role="status">
          <p className="type-h4">Booking received</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Payment status (backend-verified): <strong>{paymentStatus ?? 'PENDING'}</strong>.
            {paymentStatus !== 'SUCCESSFUL' && ' Complete the payment prompt — this page reflects the verified status, not the button you pressed.'}
          </p>
          <div className="mt-4 grid gap-2">
            <Button asChild className="min-h-[44px]"><Link href="/bookings">View my bookings</Link></Button>
            <Button asChild variant="outline" className="min-h-[44px]"><Link href={`/providers/${slug}`}>Back to provider</Link></Button>
          </div>
        </div>
      )}
    </div>
  );
}
