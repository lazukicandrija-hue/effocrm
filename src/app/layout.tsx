import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "@/components/providers/auth-provider";

export const metadata: Metadata = {
  title: "Effortless MGMT - CRM Dashboard",
  description: "Instagram account management dashboard for Effortless MGMT agency",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
