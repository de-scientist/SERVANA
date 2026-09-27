'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { updateProfileSchema, type UpdateProfileInput } from '@/lib/validation';
import { apiClient } from '@/lib/api-client';
import { clearSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/providers/toast';
import { Spinner } from '@/components/ui/spinner';

interface Profile {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  profileImage: string | null;
  status: string;
  emailVerified: boolean;
  roles: string[];
}

export default function ProfilePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdateProfileInput>({ resolver: zodResolver(updateProfileSchema) });

  React.useEffect(() => {
    apiClient.get<Profile>('/users/me').then((res) => {
      if (res.error && res.status === 401) {
        router.push('/login');
        return;
      }
      if (res.data) {
        setProfile(res.data);
        reset({ name: res.data.name, phone: res.data.phone ?? '', profileImage: res.data.profileImage ?? '' });
      } else if (res.error) {
        toast(res.error.message, 'error');
      }
      setLoading(false);
    });
  }, [router, toast, reset]);

  const onSubmit = async (values: UpdateProfileInput) => {
    const res = await apiClient.patch<Profile>('/users/me', values);
    if (res.error) {
      toast(res.error.message, 'error');
      return;
    }
    if (res.data) {
      setProfile(res.data);
      toast('Profile updated.', 'success');
    }
  };

  const onLogout = async () => {
    const refresh = (await import('@/lib/session')).getRefreshToken();
    if (refresh) await apiClient.post('/auth/logout', { refreshToken: refresh });
    clearSession();
    router.push('/login');
  };

  if (loading) {
    return (
      <main className="container flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6" />
      </main>
    );
  }

  return (
    <main className="container max-w-2xl py-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">My profile</h1>
        <Button variant="outline" onClick={onLogout}>
          Sign out
        </Button>
      </div>

      {profile && (
        <Card className="mb-6">
          <CardContent className="flex flex-wrap gap-x-8 gap-y-2 p-5 text-sm">
            <div>
              <span className="text-muted-foreground">Email</span>
              <p className="font-medium">{profile.email}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Status</span>
              <p className="font-medium">{profile.status}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Roles</span>
              <p className="font-medium">{profile.roles.join(', ')}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Email verified</span>
              <p className="font-medium">{profile.emailVerified ? 'Yes' : 'No'}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Edit profile</CardTitle>
          <CardDescription>Update your public details.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="name">
                Full name
              </label>
              <Input id="name" aria-invalid={!!errors.name} {...register('name')} />
              {errors.name && <span className="text-xs text-destructive">{errors.name.message}</span>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="phone">
                Phone
              </label>
              <Input id="phone" type="tel" {...register('phone')} />
              {errors.phone && <span className="text-xs text-destructive">{errors.phone.message}</span>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="profileImage">
                Profile image URL
              </label>
              <Input id="profileImage" type="url" {...register('profileImage')} />
              {errors.profileImage && <span className="text-xs text-destructive">{errors.profileImage.message}</span>}
            </div>
            <div className="flex gap-3">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner className="h-4 w-4" />}
                Save changes
              </Button>
              <Button type="button" variant="ghost" onClick={() => router.push('/account')}>
                Account settings
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
