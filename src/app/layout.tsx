import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shamah Clinics | عيادات شمة",
  description: "عيادات شمة لطب التجميل والليزر والعناية المتكاملة بالبشرة",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="h-full">
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
