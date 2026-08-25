import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { BottomPlayer } from "@/components/bottom-player";
import { PlayerProvider } from "@/components/player-provider";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Audio Attic",
  description: "Private catalog of composed library tracks available for licensing.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={sans.variable}>
      <body className={`${sans.className} antialiased`}>
        <PlayerProvider>
          <div className="app-content">{children}</div>
          <BottomPlayer />
        </PlayerProvider>
      </body>
    </html>
  );
}
