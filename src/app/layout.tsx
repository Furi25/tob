import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tree of Books",
  description: "Browse the books on display in our little pixel-art bookshop.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
