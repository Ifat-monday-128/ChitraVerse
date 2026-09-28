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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{__html: `
          try {
            var theme = localStorage.getItem('chitraverse-theme') || 'red';
            document.documentElement.setAttribute('data-theme', theme);
            if (theme === 'custom') {
              var customColor = localStorage.getItem('chitraverse-custom-color') || '#ffffff';
              document.documentElement.style.setProperty('--custom-accent', customColor);
            }
          } catch (e) {}
        `}} />
      </head>
      <body>{children}</body>
    </html>
  );
}
