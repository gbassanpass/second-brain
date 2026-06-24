import type { Metadata } from 'next';
import { Fraunces } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

// Editorial serif for display headlines (premium, distinctive — landing).
const display = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'falacomigo.ai',
  description: 'Mentes digitais de criadores — converse com o conteúdo deles.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`dark ${display.variable}`}>
      <body className="min-h-screen bg-bg text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
