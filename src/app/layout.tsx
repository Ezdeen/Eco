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
  title: "منصة ESG للطاقة الشمسية | BrightFuture Energy",
  description:
    "منصة SaaS ذكية متعددة المؤسسات لقياس الأثر البيئي والاستدامة لمشاريع الطاقة الشمسية، بدعم توثيق Hedera وحسابات الكربون المتجنب وفق GHG Protocol.",
  keywords: [
    "ESG",
    "الطاقة الشمسية",
    "الكربون المتجنب",
    "Hedera",
    "GHG Protocol",
    "الاستدامة",
    "SaaS",
  ],
  authors: [{ name: "BrightFuture Energy Co." }],
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
