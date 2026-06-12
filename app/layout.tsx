import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CCA Exam Simulator',
  description:
    'Live, scenario-based practice for the Claude Certified Architect (CCA) Foundations exam.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
