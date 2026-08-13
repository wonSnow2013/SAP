import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spieleabend-App",
  description: "Findet gemeinsam den perfekten Spielabend – ohne Chat-Chaos.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-slate-50 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
