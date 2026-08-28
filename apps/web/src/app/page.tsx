import { LoginForm } from './login-form';

export default function HomePage() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-10 py-12">
      <section className="flex flex-col items-center gap-3 text-center">
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          Phase 1 · Foundation
        </span>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">SERVANA</h1>
        <p className="max-w-xl text-balance text-muted-foreground">
          AI-powered marketplace for beauty &amp; personal-care services. The foundation is wired:
          design system, validation, API client, auth, and resilient UI states.
        </p>
      </section>
      <LoginForm />
    </main>
  );
}
