'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@/lib/validation';
import { apiClient } from '@/lib/api-client';
import { setSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/providers/toast';
import { Spinner } from '@/components/ui/spinner';

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (values: RegisterInput) => {
    const res = await apiClient.post<{ accessToken: string; refreshToken: string }>('/auth/register', values);
    if (res.error) {
      toast(res.error.message, 'error');
      return;
    }
    if (res.data) {
      setSession(res.data);
      toast('Account created. Verify your email to unlock everything.', 'success');
      router.push('/profile');
    }
  };

  return (
    <main className="container flex min-h-screen items-center justify-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>Join SERVANA as a customer, or as a provider to offer services.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="name">
                Full name
              </label>
              <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...register('name')} />
              {errors.name && <span className="text-xs text-destructive">{errors.name.message}</span>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="email">
                Email
              </label>
              <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
              {errors.email && <span className="text-xs text-destructive">{errors.email.message}</span>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="phone">
                Phone <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input id="phone" type="tel" autoComplete="tel" {...register('phone')} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="password">
                Password
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
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="role">
                I want to
              </label>
              <select
                id="role"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                {...register('role')}
              >
                <option value="CUSTOMER">Book services (Customer)</option>
                <option value="PROVIDER">Offer services (Provider)</option>
              </select>
            </div>
            <Button type="submit" disabled={isSubmitting} className="mt-2">
              {isSubmitting && <Spinner className="h-4 w-4" />}
              Create account
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
