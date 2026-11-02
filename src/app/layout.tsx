import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kenya Unified Financial Dashboard | M-Pesa Daraja, Direct Banks & KRA eTIMS',
  description: 'Native Kenyan personal cash flow, automated accounting, real-time Daraja callbacks, direct bank gateways, PayPal unified checkout, and KRA eTIMS tax sync.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100">{children}</body>
    </html>
  );
}
