import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Arena - Discussions Multi-Agents IA",
  description:
    "Orchestrez des discussions entre plusieurs agents IA sur un sujet donne. Configurez les participants, lancez le debat et observez en temps reel.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
