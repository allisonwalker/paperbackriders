import type { Metadata } from "next";
import { Alfa_Slab_One, Fraunces, Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  weight: ["400", "500"],
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

const alfa = Alfa_Slab_One({
  subsets: ["latin"],
  variable: "--font-alfa",
  weight: "400",
});

export const metadata: Metadata = {
  title: "Paperback Riders",
  description: "This month's pick for the Paperback Riders book club.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${fraunces.variable} ${alfa.variable}`}>
      <body>{children}</body>
    </html>
  );
}
