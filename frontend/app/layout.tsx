import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VinAgent",
  description: "AI-assisted winery operations dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
