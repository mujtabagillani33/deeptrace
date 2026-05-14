import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'DeepTrace — Autonomous Research Engine',
  description: 'Multi-agent AI research system with real-time web intelligence, hallucination detection, and human-in-the-loop verification.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased text-gray-200">{children}</body>
    </html>
  );
}
