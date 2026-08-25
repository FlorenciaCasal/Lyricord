import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { getAuthSession } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://lyricord.com.ar"),
  title: "Musum",
  description: "Guarda letras y acordes con OCR.",
  manifest: "/manifest.webmanifest",
  applicationName: "Musum",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Musum",
    description: "Guarda letras y acordes con OCR.",
    url: "/",
    siteName: "Musum",
    images: [
      {
        url: "/og-image.png?v=2",
        width: 1200,
        height: 630,
        alt: "Musum",
      },
    ],
    locale: "es_AR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Musum",
    description: "Guarda letras y acordes con OCR.",
    images: ["/og-image.png?v=2"],
  },
  icons: {
    icon: "/icon",
    apple: "/apple-icon",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Musum",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#020617",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getAuthSession();

  return (
    <html lang="es" className={`h-full antialiased ${inter.variable}`}>
      <body className="min-h-full bg-slate-950 text-white flex flex-col">
        <PwaRegister />
        {session?.user ? (
          <header className="border-b border-slate-800 bg-slate-950/90">
            <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
              <p className="text-base font-semibold tracking-[-0.02em] text-white">
                Musum
              </p>
              <LogoutButton />
            </div>
          </header>
        ) : null}
        {children}
      </body>
    </html>
  );
}
