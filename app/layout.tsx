import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "../styles/globals.css";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  variable: "--font-display-loaded",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-body-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "[NAMA SEKOLAH]",
  description: "[TAGLINE SEKOLAH]",
};

export const viewport: Viewport = {
  themeColor: "#f4f1ea",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // The `js` marker below is added by this page's own script before React
    // hydrates, so <html> legitimately carries one more class than the client
    // tree expects. Everything else about this element is ours and static.
    <html
      lang="id"
      className={`${display.variable} ${body.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Marks that scripting is available, so the reveal styles can stay
            off for anyone whose JS never runs. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
