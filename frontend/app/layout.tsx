import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChitraVerse — Movies beyond the frame",
  description: "Discover movies and series in ChitraVerse.",
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
