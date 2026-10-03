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
import { Breadcrumb } from '@/components/ui/tabs';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

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

const SHORTCUTS = [
  { href: '/bookings', title: 'My bookings', text: 'Upcoming, active & history' },
  { href: '/orders', title: 'My orders', text: 'Product purchases' },
  { href: '/rewards', title: 'Loyalty & referrals', text: 'Points, tiers & rewards' },
  { href: '/notifications', title: 'Notifications', text: 'Booking & payment updates' },
  { href: '/account', title: 'Account & security', text: 'Password, privacy, sessions' },
  { href: '/support', title: 'Help & support', text: 'Disputes & contact' },
];

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
      <main className="mx-auto max-w-2xl px-4 py-12" aria-label="Loading profile">
        <Spinner className="h-6 w-6" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Profile' }]} />
      <div className="mb-6 mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={profile?.name} src={profile?.profileImage} size="lg" />
          <div>
            <h1 className="type-h2">{profile?.name ?? 'My profile'}</h1>
            <p className="text-sm text-muted-foreground">{profile?.email}</p>
          </div>
        </div>
        <Button variant="outline" onClick={onLogout}>
          Sign out
        </Button>
      </div>

      {profile && (
        <Card className="mb-4">
          <CardContent className="flex flex-wrap gap-x-6 gap-y-3 p-5 text-sm">
            <div>
              <span className="text-muted-foreground">Status</span>
              <p className="font-medium">{profile.status}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Roles</span>
              <p className="flex flex-wrap gap-1 font-medium">
                {profile.roles.map((r) => (
                  <Badge key={r} variant="outline">{r}</Badge>
                ))}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Email verified</span>
              <p className="font-medium">{profile.emailVerified ? '✓ Yes' : 'Not yet'}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <nav aria-label="Account sections" className="mb-6 grid gap-2 sm:grid-cols-2">
        {SHORTCUTS.map((s) => (
          <Link key={s.href} href={s.href} className="card-rest p-4 transition-micro hover:border-primary/50">
            <p className="font-semibold">{s.title}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{s.text}</p>
          </Link>
        ))}
      </nav>

      <Card>
        <CardHeader>
          <CardTitle>Edit profile</CardTitle>
          <CardDescription>Update your public details.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <label className="type-label" htmlFor="name">Full name</label>
              <Input id="name" aria-invalid={!!errors.name} aria-describedby={errors.name ? 'name-error' : undefined} {...register('name')} />
              {errors.name && <span id="name-error" role="alert" className="text-xs text-destructive">{errors.name.message}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="type-label" htmlFor="phone">Phone</label>
              <Input id="phone" type="tel" autoComplete="tel" {...register('phone')} />
              {errors.phone && <span role="alert" className="text-xs text-destructive">{errors.phone.message}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="type-label" htmlFor="profileImage">Profile image URL</label>
              <Input id="profileImage" type="url" inputMode="url" {...register('profileImage')} />
              {errors.profileImage && <span role="alert" className="text-xs text-destructive">{errors.profileImage.message}</span>}
            </div>
            <div className="flex flex-wrap gap-3">
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
