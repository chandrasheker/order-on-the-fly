import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter } from "@/components/SiteFooter";
import { FixedThemeToggle } from "@/components/FixedThemeToggle";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TableTap — Smart Restaurant Ordering",
  description:
    "QR-powered table ordering SaaS with smart prep timers, staff alerts, wait-time games, and daily reports.",
};

const themeInitScript = `(function(){try{var t=localStorage.getItem('tabletap-theme');document.documentElement.classList.add(t==='light'?'light':'dark');}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <FixedThemeToggle />
          <div className="flex-1 flex flex-col min-h-0">{children}</div>
          <SiteFooter />
        </ThemeProvider>
      </body>
    </html>
  );
}
