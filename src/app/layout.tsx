import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { Ambient } from "@/components/ambient";
import { PointerGlow } from "@/components/pointer-glow";
import { NavProgress } from "@/components/route-transition";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import "./globals.css";

/**
 * Três famílias com papéis fixos.
 *
 * Display é um grotesco de eixo variável, não uma serifa editorial: o app é
 * um instrumento, e serifa de revista dava a ele a voz de um blog sobre
 * produtividade. O Bricolage tem desenho próprio o bastante para a marca não
 * depender de cor, e numerais largos que sustentam os números grandes do
 * painel.
 *
 * Mono é restrito a NÚMERO, medida e tecla. Rótulo de texto em mono é
 * fantasia de terminal: quando tudo é mono, nada parece dado.
 */
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const sans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "eLv · Segundo cérebro",
  description:
    "Memória secundária pessoal: captura, organiza e reencontra tudo sobre IA, coding e agentic.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "eLv",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#08090C",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`dark ${sans.variable} ${display.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-background font-sans">
        <Ambient />
        <NavProgress />
        {children}
        <PointerGlow />
        <Toaster
          position="top-center"
          theme="dark"
          closeButton
          toastOptions={{
            classNames: {
              toast:
                "!rounded-lg !border-0 !bg-[hsl(var(--surface-raised))] !text-foreground !shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.08),0_24px_48px_-24px_hsl(0_0%_0%/0.9)] !font-sans",
              title: "!text-sm !font-medium",
              description: "!text-xs !text-muted-foreground",
              actionButton: "!bg-acid !text-acid-foreground",
              closeButton: "!bg-[hsl(var(--surface))] !border-border !text-muted-foreground",
            },
          }}
        />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
