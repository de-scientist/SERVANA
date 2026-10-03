import Link from 'next/link';
import { Scissors, Sparkles, Brush, Hand, HeartHandshake, Flower2, type LucideIcon } from 'lucide-react';

/** Canonical marketplace categories. Imagery-free but icon-led; expandable. */
export const MARKETPLACE_CATEGORIES: { slug: string; name: string; blurb: string; icon: LucideIcon }[] = [
  { slug: 'hair', name: 'Hair', blurb: 'Braids, styling & care', icon: Scissors },
  { slug: 'makeup', name: 'Makeup', blurb: 'Bridal, events & glam', icon: Sparkles },
  { slug: 'nails', name: 'Nails', blurb: 'Manicure & pedicure', icon: Hand },
  { slug: 'barber', name: 'Barber', blurb: 'Cuts, fades & grooming', icon: Brush },
  { slug: 'skincare', name: 'Skincare', blurb: 'Facials & treatments', icon: Flower2 },
  { slug: 'massage', name: 'Massage', blurb: 'Relaxation & recovery', icon: HeartHandshake },
];

export function CategoryGrid() {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Popular categories">
      {MARKETPLACE_CATEGORIES.map((c) => (
        <li key={c.slug}>
          <Link
            href={`/search?category=${encodeURIComponent(c.slug)}`}
            className="card-rest group flex h-full flex-col items-start gap-2 p-4 transition-micro hover:border-primary/50 hover:shadow-md"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-micro group-hover:bg-primary group-hover:text-primary-foreground">
              <c.icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="font-semibold leading-tight">{c.name}</span>
            <span className="text-xs text-muted-foreground">{c.blurb}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
