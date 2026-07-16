import type { Metadata } from "next";
import { Archivo_Black, Barlow_Condensed, Work_Sans, IBM_Plex_Mono } from "next/font/google";
import { QuoteProvider } from "@/lib/QuoteContext";
import { ThemeProvider } from "@/lib/ThemeContext";
import { LanguageProvider } from "@/lib/LanguageContext";
import SupportChat from "@/components/SupportChat";
import "./globals.css";

const archivo = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-archivo",
});
const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-barlow",
});
const work = Work_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-work",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Demand Pilot",
  description: "Voice-to-quote for tradespeople",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Demand Pilot",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/*
        Anti-flash script: runs synchronously before any paint.
        Reads localStorage and applies the .light class immediately so
        there's never a flash of the wrong theme on first load.
      */}
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#ff6a1f" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                try {
                  var m = localStorage.getItem('theme') || 'dark';
                  var resolved = m === 'system'
                    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
                    : m;
                  if (resolved === 'light') document.documentElement.classList.add('light');
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${archivo.variable} ${barlow.variable} ${work.variable} ${mono.variable} font-work text-paper antialiased`}
      >
        <ThemeProvider>
          <LanguageProvider>
            <QuoteProvider>
              <div className="mx-auto min-h-screen max-w-md">{children}</div>
              <SupportChat />
            </QuoteProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
