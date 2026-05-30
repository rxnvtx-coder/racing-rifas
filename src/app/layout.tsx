import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RacingRifas - Rifa Digital Oficial",
  description: "Faça parte da História do Racing Club de Curitiba, e ajude o clube a participar da Conference Cup! 3 prêmios, 3 chances de ganhar, e em campo lutaremos por essas cores e por você, torcedor!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
