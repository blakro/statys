import type { Metadata } from "next";
import localFont from "next/font/local";
import { ClerkProvider } from "@clerk/nextjs";
import { frFR } from "@clerk/localizations";
import { clerkEnabled } from "@/lib/roles";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Statys — Analyse statistique bancaire",
  description:
    "Plateforme SaaS d'analyse statistique pour banques : import de données, analyses univariées et bivariées, rapports PDF.",
};

/** Thème Clerk aligné sur la charte navy de la plateforme. */
const clerkAppearance = {
  variables: {
    colorPrimary: "#294477",
    colorText: "#0f1c2e",
    borderRadius: "0.5rem",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const body = (
    <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
      {children}
    </body>
  );
  return (
    <html lang="fr">
      {clerkEnabled ? (
        <ClerkProvider localization={frFR} appearance={clerkAppearance}>
          {body}
        </ClerkProvider>
      ) : (
        body
      )}
    </html>
  );
}
