import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { I18nProvider } from '@/lib/i18n';
import { APP_META } from '@/lib/appMeta';
import { ConsoleBanner } from '@/components/layout/ConsoleBanner';

export const metadata: Metadata = {
  title: APP_META.name,
  description: 'Centralized Multi-Site Network Infrastructure, IPAM, Diagram & Vault Platform',
  authors: [{ name: APP_META.author }],
  creator: APP_META.author,
  publisher: APP_META.author,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <I18nProvider>
          <ConsoleBanner />
          <AuthProvider>{children}</AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
