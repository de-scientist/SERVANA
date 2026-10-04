import { CardGridSkeleton } from '@/components/ui/skeleton';

export default function LoadingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8" aria-label="Loading page">
      <div className="skeleton h-8 w-48" />
      <div className="skeleton mt-2 h-4 w-72" />
      <div className="mt-6">
        <CardGridSkeleton count={6} />
      </div>
    </div>
  );
}
