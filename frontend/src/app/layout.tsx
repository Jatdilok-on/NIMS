import type { Metadata } from 'next';
import { Anuphan, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { I18nProvider } from '@/lib/i18n';
import { APP_META } from '@/lib/appMeta';
import { ConsoleBanner } from '@/components/layout/ConsoleBanner';

const anuphan = Anuphan({
  subsets: ['thai', 'latin'],
  display: 'swap',
  variable: '--font-anuphan',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: APP_META.name,
  description: 'Centralized Multi-Site Network Infrastructure, IPAM, Diagram & Vault Platform',
  authors: [{ name: APP_META.author }],
  creator: APP_META.author,
  publisher: APP_META.author,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="th"
      className={`${anuphan.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans min-h-screen antialiased">
        <I18nProvider>
          <ConsoleBanner />
          <AuthProvider>{children}</AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
