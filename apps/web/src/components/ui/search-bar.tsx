import { Search } from 'lucide-react';
import { Input } from './input';
import { Button } from './button';

/** Prominent marketplace search bar with accessible label + example hints. */
export function SearchBar({
  defaultValue,
  action = '/search',
  placeholder = 'Try "Makeup artist near me" or "Barber tomorrow"…',
}: {
  defaultValue?: string;
  action?: string;
  placeholder?: string;
}) {
  return (
    <form method="get" action={action} role="search" aria-label="Marketplace search" className="w-full">
      <label htmlFor="marketplace-search" className="sr-only">
        Search services, providers or products
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="marketplace-search"
            name="q"
            type="search"
            defaultValue={defaultValue}
            placeholder={placeholder}
            autoComplete="off"
            className="h-12 rounded-xl border bg-card pl-10 text-[15px] shadow-soft"
          />
        </div>
        <Button type="submit" size="lg" className="h-12 rounded-xl px-7">
          Search
        </Button>
      </div>
    </form>
  );
}
