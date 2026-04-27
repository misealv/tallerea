import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL('https://tallerea.cl'),
  title: "Tallerea — Encuentra tu taller de arte",
  description: "Conectamos talleristas e instituciones de artes visuales, teatro, danza y música con personas que buscan talleres en Chile.",
  openGraph: {
    siteName: 'Tallerea',
    locale: 'es_CL',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.className} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
