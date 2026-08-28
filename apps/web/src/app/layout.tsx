import type { Metadata } from 'next';
import { AppProviders } from '@/components/providers/app-providers';
import './styles/globals.css';

export const metadata: Metadata = {
  title: 'SERVANA — Beauty & Personal Care Marketplace',
  description:
    'Discover, book and pay verified beauty & personal-care providers. Shop products, earn rewards.',
  openGraph: {
    title: 'SERVANA',
    description: 'AI-powered marketplace for beauty & personal-care services.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
