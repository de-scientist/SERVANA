'use client';

import * as React from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/validation';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/providers/toast';
import { Spinner } from '@/components/ui/spinner';

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = async (values: ForgotPasswordInput) => {
    // Always succeeds from the client perspective (no account enumeration).
    const res = await apiClient.post('/auth/forgot-password', values);
    if (res.error) {
      toast(res.error.message, 'error');
      return;
    }
    toast('If that email exists, a reset link is on its way.', 'success');
  };

  return (
    <main className="container flex min-h-screen items-center justify-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>Enter your email and we&apos;ll send a reset link.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="email">
                Email
              </label>
              <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
              {errors.email && <span className="text-xs text-destructive">{errors.email.message}</span>}
            </div>
            <Button type="submit" disabled={isSubmitting} className="mt-2">
              {isSubmitting && <Spinner className="h-4 w-4" />}
              Send reset link
            </Button>
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
