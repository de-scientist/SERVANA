import Link from 'next/link';
import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatMinorUnits } from '@/lib/format';

export interface ServiceCardData {
  id: string;
  name: string;
  description?: string | null;
  priceCents: string;
  currency: string;
  durationMin: number;
  provider: { businessName: string | null; slug: string; city?: string | null; verified?: boolean };
}

/** Reusable service card — price always visible, never hidden. */
export function ServiceCard({ service }: { service: ServiceCardData }) {
  return (
    <article className="card-rest flex h-full flex-col p-4 transition-micro hover:border-primary/50 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium leading-snug">
          <Link href={`/services/${service.id}`} className="hover:text-primary hover:underline">
            {service.name}
          </Link>
        </h3>
        <span className="shrink-0 font-semibold tabular-nums">
          {formatMinorUnits(service.priceCents, service.currency)}
        </span>
      </div>
      {service.description && (
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{service.description}</p>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
        <Badge variant="default">
          <Clock className="h-3 w-3" aria-hidden /> {service.durationMin} min
        </Badge>
        <Link
          href={`/providers/${service.provider.slug}`}
          className="text-muted-foreground hover:text-foreground hover:underline"
        >
          {service.provider.businessName ?? 'Provider'}
        </Link>
        {service.provider.verified && <Badge variant="success">✓ Verified</Badge>}
      </div>
      <div className="mt-auto pt-3">
        <Link
          href={`/services/${service.id}`}
          className="inline-flex min-h-[40px] w-full items-center justify-center rounded-md border font-medium transition-micro hover:border-primary hover:text-primary"
          aria-label={`Book ${service.name}`}
        >
          View &amp; book
        </Link>
      </div>
    </article>
  );
}
