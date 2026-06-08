import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LicitaFácil — Sistema de Licitações",
  description: "Sistema de readequação de planilhas de licitação",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
