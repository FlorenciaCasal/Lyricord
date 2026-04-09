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
  title: "Cancionero",
  description: "MVP para guardar canciones con letra y acordes",
  manifest: "/manifest.webmanifest",
  applicationName: "Cancionero",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Cancionero",
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
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">Cancionero</p>
                <p className="truncate text-sm text-slate-400">
                  {session.user.email}
                </p>
              </div>
              <LogoutButton />
            </div>
          </header>
        ) : null}
        {children}
      </body>
    </html>
  );
}
