import type { Metadata } from "next";
import { Manrope, Tenor_Sans } from "next/font/google";
import "./globals.css";

const tenor = Tenor_Sans({
  weight: "400",
  variable: "--font-tenor",
  subsets: ["latin", "cyrillic"],
});

const manrope = Manrope({
  weight: ["400", "500", "600"],
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "Fayek Abrasives",
  description:
    "Fayek Abrasives — industrial abrasives & filtration supplier, Cairo, Egypt (since 1997). Operations back-office.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${tenor.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
