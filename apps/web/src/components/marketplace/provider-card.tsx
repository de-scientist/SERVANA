import Link from 'next/link';
import { BadgeCheck, MapPin } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Rating } from '@/components/ui/rating';
import { Price } from '@/components/ui/price';
import type { PublicProviderSummary } from '@/lib/server-api';

/**
 * Reusable provider card. Renders backend data only — rating/customers served
 * are shown only when the caller supplies them (no fabricated stats).
 */
export function ProviderCard({
  provider,
  rating,
  reviewCount,
  customersServed,
  fromPrice,
  availabilityLabel,
}: {
  provider: Pick<
    PublicProviderSummary,
    'businessName' | 'slug' | 'city' | 'country' | 'verified' | 'verificationLevel' | 'categories'
  >;
  rating?: number | null;
  reviewCount?: number | null;
  customersServed?: number | null;
  fromPrice?: number | null;
  availabilityLabel?: string | null;
}) {
  return (
    <article className="card-rest flex h-full flex-col p-5 transition-micro hover:border-primary/50 hover:shadow-md">
      <div className="flex items-start gap-3">
        <Avatar name={provider.businessName} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate font-semibold leading-tight">
              <Link href={`/providers/${provider.slug}`} className="hover:text-primary hover:underline">
                {provider.businessName ?? 'Provider'}
              </Link>
            </h3>
            {provider.verified && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-primary" title="Verified provider">
                <BadgeCheck className="h-4 w-4 fill-primary/10" aria-hidden />
                <span className="sr-only">Verified provider</span>
              </span>
            )}
          </div>
          <Rating value={rating ?? null} count={reviewCount ?? null} />
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            {[provider.city, provider.country].filter(Boolean).join(', ') || 'Location on request'}
          </p>
        </div>
      </div>

      {provider.categories.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Specialities">
          {provider.categories.slice(0, 3).map((c) => (
            <Badge key={c.id} variant="default">
              {c.name}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {customersServed != null && customersServed > 0 && (
          <span>{customersServed.toLocaleString()} customers served</span>
        )}
        {availabilityLabel && <span className="font-medium text-emerald-700 dark:text-emerald-300">{availabilityLabel}</span>}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <span className="text-sm">
          {fromPrice != null ? (
            <Price major={fromPrice} prefix="From" />
          ) : (
            <span className="text-muted-foreground">See services for pricing</span>
          )}
        </span>
        <Link
          href={`/providers/${provider.slug}`}
          className="inline-flex min-h-[40px] items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-micro hover:opacity-90"
        >
          View profile
        </Link>
      </div>
    </article>
  );
}
