'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/validation';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/providers/toast';
import { Spinner } from '@/components/ui/spinner';

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token },
  });

  const onSubmit = async (values: ResetPasswordInput) => {
    const res = await apiClient.post('/auth/reset-password', values);
    if (res.error) {
      toast(res.error.message, 'error');
      return;
    }
    toast('Password updated. Please sign in.', 'success');
    router.push('/login');
  };

  return (
    <main className="container flex min-h-screen items-center justify-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>Pick a strong password you don&apos;t use elsewhere.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <input type="hidden" {...register('token')} />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="password">
                New password
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.password}
                {...register('password')}
              />
              {errors.password && <span className="text-xs text-destructive">{errors.password.message}</span>}
            </div>
            <Button type="submit" disabled={isSubmitting || !token} className="mt-2">
              {isSubmitting && <Spinner className="h-4 w-4" />}
              Update password
            </Button>
            {!token && <p className="text-xs text-destructive">Missing or invalid reset token in the link.</p>}
            <p className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="text-primary hover:underline">
                Back to sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
