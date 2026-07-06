import type { Metadata } from "next";
import { Manrope, Saira } from "next/font/google";
import "./globals.css";

// Industrial display face — squared, technical letterforms for headings and
// control-panel labels. Kept on the --font-tenor variable so the theme mapping
// (font-serif → this face) stays unchanged across the app.
const tenor = Saira({
  weight: ["400", "500", "600", "700"],
  variable: "--font-tenor",
  subsets: ["latin", "latin-ext"],
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
