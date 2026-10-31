import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Painel Administrativo | VenteBot Telegram Reseller",
  description: "Sistema integrado de revenda digital no Telegram via VenteBot Reseller API",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-screen bg-[#070812] text-slate-100 antialiased selection:bg-indigo-500/30 selection:text-indigo-200">
        {children}
        <Toaster position="top-right" richColors theme="dark" />
      </body>
    </html>
  );
}
