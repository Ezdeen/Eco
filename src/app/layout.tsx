import type { Metadata } from "next";
import { Cairo, Tajawal } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700", "800"],
});

export const metadata: Metadata = {
  title: "Eco Ledger | منصة dMRV لقياس الأثر البيئي وتقارير ESG",
  description:
    "Eco Ledger منصة dMRV رقمية تساعد المنشآت الصغيرة والمتوسطة على قياس أثرها البيئي وإصدار تقارير استدامة ESG موثوقة، بدعم توثيق Hedera وحسابات الكربون وفق GHG Protocol، لتسهيل وصولها إلى التمويل الأخضر من القطاع المصرفي.",
  keywords: [
    "ESG",
    "dMRV",
    "الأثر البيئي",
    "الاستدامة",
    "التمويل الأخضر",
    "المنشآت الصغيرة والمتوسطة",
    "الكربون المتجنب",
    "Hedera",
    "GHG Protocol",
    "SaaS",
  ],
  authors: [{ name: "Eco Ledger" }],
  icons: {
    icon: "/logo.svg",
    apple: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${cairo.variable} ${tajawal.variable} font-tajawal antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <SonnerToaster position="top-left" />
      </body>
    </html>
  );
}
