import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "gbrain-sandbox",
  description: "Next.js client for the Bun gbrain-sandbox API",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
