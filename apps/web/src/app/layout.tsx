import type { Metadata, Viewport } from 'next';
import { AppProviders } from '@/components/providers/app-providers';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { BottomNav } from '@/components/layout/bottom-nav';
import '../styles/globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#C2247B',
};

const base = process.env.WEB_BASE_URL ?? 'https://servana.example.com';

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title: {
    default: 'SERVANA — Trusted Beauty & Personal-Care Marketplace',
    template: '%s | SERVANA',
  },
  description:
    'Discover verified beauty & personal-care providers, compare transparent prices, book in minutes and pay securely. Shop professional-recommended products and earn rewards.',
  keywords: ['beauty marketplace', 'book makeup artist', 'hair stylist', 'barber', 'nails', 'skincare', 'massage', 'Kenya'],
  openGraph: {
    title: 'SERVANA — Trusted Beauty & Personal-Care Marketplace',
    description: 'Book verified beauty professionals. Transparent pricing, secure payments, real reviews.',
    type: 'website',
    url: base,
    siteName: 'SERVANA',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SERVANA — Trusted Beauty & Personal-Care Marketplace',
    description: 'Book verified beauty professionals. Transparent pricing, secure payments.',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-black"
        >
          Skip to main content
        </a>
        <SiteHeader />
        <main id="main-content" className="pb-20 md:pb-0">
          <AppProviders>{children}</AppProviders>
        </main>
        <div className="pb-16 md:pb-0">
          <SiteFooter />
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
