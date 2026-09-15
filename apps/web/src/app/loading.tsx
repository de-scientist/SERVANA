import { Spinner } from '@/components/ui/spinner';

export default function LoadingPage() {
  return (
    <div className="container flex min-h-[60vh] items-center justify-center">
      <Spinner className="h-8 w-8 text-primary" />
    </div>
  );
}
