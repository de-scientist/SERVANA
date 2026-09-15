'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/providers/toast';

function VerifyEmailForm() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const { toast } = useToast();
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

  React.useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    setStatus('loading');
    apiClient.post('/auth/verify-email', { token }).then((res) => {
      if (res.error) {
        setStatus('error');
        toast(res.error.message, 'error');
      } else {
        setStatus('ok');
        toast('Email verified. Thank you!', 'success');
      }
    });
  }, [token, toast]);

  return (
    <main className="container flex min-h-screen items-center justify-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Email verification</CardTitle>
          <CardDescription>
            {status === 'loading' && 'Verifying your email…'}
            {status === 'ok' && 'Your email is verified.'}
            {status === 'error' && 'This verification link is invalid or expired.'}
            {status === 'idle' && 'Checking your link…'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          {status === 'loading' && <Spinner className="h-5 w-5" />}
          <Link href="/profile" className="text-sm text-primary hover:underline">
            Go to my account
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <React.Suspense fallback={<Spinner className="m-auto h-6 w-6" />}>
      <VerifyEmailForm />
    </React.Suspense>
  );
}
