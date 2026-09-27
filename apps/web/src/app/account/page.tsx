'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  changeEmailSchema,
  changePasswordSchema,
  type ChangeEmailInput,
  type ChangePasswordInput,
} from '@/lib/validation';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/providers/toast';
import { Spinner } from '@/components/ui/spinner';

export default function AccountSettingsPage() {
  const router = useRouter();
  const { toast } = useToast();

  const pw = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) });
  const em = useForm<ChangeEmailInput>({ resolver: zodResolver(changeEmailSchema) });

  const onPassword = async (values: ChangePasswordInput) => {
    const res = await apiClient.patch('/users/me/password', values);
    if (res.error) {
      toast(res.error.message, 'error');
      return;
    }
    toast('Password changed. Please sign in again on other devices.', 'success');
    pw.reset();
  };

  const onEmail = async (values: ChangeEmailInput) => {
    const res = await apiClient.patch('/users/me/email', values);
    if (res.error) {
      toast(res.error.message, 'error');
      return;
    }
    toast('Email updated. Verify your new address via the link we sent.', 'success');
    em.reset();
  };

  return (
    <main className="container max-w-2xl py-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Account settings</h1>
        <Link href="/profile" className="text-sm text-primary hover:underline">
          Back to profile
        </Link>
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>For your security, confirm your current password.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={pw.handleSubmit(onPassword)} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium" htmlFor="currentPassword">
                  Current password
                </label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={!!pw.formState.errors.currentPassword}
                  {...pw.register('currentPassword')}
                />
                {pw.formState.errors.currentPassword && (
                  <span className="text-xs text-destructive">{pw.formState.errors.currentPassword.message}</span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium" htmlFor="pw">
                  New password
                </label>
                <Input
                  id="pw"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={!!pw.formState.errors.password}
                  {...pw.register('password')}
                />
                {pw.formState.errors.password && (
                  <span className="text-xs text-destructive">{pw.formState.errors.password.message}</span>
                )}
              </div>
              <Button type="submit" disabled={pw.formState.isSubmitting} className="self-start">
                {pw.formState.isSubmitting && <Spinner className="h-4 w-4" />}
                Update password
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change email</CardTitle>
            <CardDescription>You&apos;ll need to verify your new email address.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={em.handleSubmit(onEmail)} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium" htmlFor="em-password">
                  Password
                </label>
                <Input
                  id="em-password"
                  type="password"
                  autoComplete="current-password"
                  {...em.register('password')}
                />
                {em.formState.errors.password && (
                  <span className="text-xs text-destructive">{em.formState.errors.password.message}</span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium" htmlFor="em-email">
                  New email
                </label>
                <Input
                  id="em-email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={!!em.formState.errors.email}
                  {...em.register('email')}
                />
                {em.formState.errors.email && (
                  <span className="text-xs text-destructive">{em.formState.errors.email.message}</span>
                )}
              </div>
              <Button type="submit" disabled={em.formState.isSubmitting} className="self-start">
                {em.formState.isSubmitting && <Spinner className="h-4 w-4" />}
                Update email
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
