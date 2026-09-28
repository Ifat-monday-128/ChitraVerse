import type { Metadata } from "next";
import "./globals.css";
import "./brand-wordmark.css";

export const metadata: Metadata = {
  title: "ChitraVerse",
  description: "Discover movies and series in ChitraVerse.",
  icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }] },
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
