import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-10 py-12">
      <section className="flex flex-col items-center gap-3 text-center">
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          Phase 2 · Authentication & Identity
        </span>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">SERVANA</h1>
        <p className="max-w-xl text-balance text-muted-foreground">
          AI-powered marketplace for beauty &amp; personal-care services. Your account is protected with
          secure passwords, refresh-token sessions, email verification, and role-based access.
        </p>
      </section>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/providers"
          className="inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Explore providers
        </Link>
        <Link
          href="/register"
          className="inline-flex h-11 items-center rounded-md border border-input px-6 text-sm font-medium hover:bg-muted"
        >
          Create account
        </Link>
        <Link
          href="/login"
          className="inline-flex h-11 items-center rounded-md px-4 text-sm font-medium text-primary hover:underline"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
