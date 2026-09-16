import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrustLedger - Research Command Center",
  description:
    "Tamper-evident audit layer for Deloitte client research agents - every recommendation recorded, replayable, and verifiable",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" style={{ colorScheme: "light" }}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
