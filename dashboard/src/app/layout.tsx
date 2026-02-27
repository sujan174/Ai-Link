import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { ProjectProvider } from "@/contexts/project-context";
import { ThemeProvider } from "next-themes";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "AIlink Dashboard",
  description: "Manage tokens, approvals, and audit logs for the AIlink Gateway",
};

import { Breadcrumbs } from "@/components/breadcrumbs";
import { CommandPalette } from "@/components/command-palette";
import { MobileNav } from "@/components/mobile-nav";
import { NotificationBell } from "@/components/notification-bell";
import { ProjectSwitcher } from "@/components/project-switcher";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} flex h-screen w-full bg-background font-sans antialiased text-foreground`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <ProjectProvider>
            <div className="flex h-full w-full">
              <Sidebar className="hidden border-r md:flex" />
              <main className="flex-1 flex flex-col overflow-hidden">
                <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/90 px-4 lg:px-5 backdrop-blur-sm">
                  <div className="flex items-center gap-2 flex-1">
                    <MobileNav />
                    <Breadcrumbs />
                  </div>
                  <div className="flex items-center gap-2.5">
                    <ProjectSwitcher className="w-[180px] h-7" />
                    <NotificationBell />
                  </div>
                </header>
                <div className="flex-1 overflow-y-auto p-4 lg:p-5">
                  <div className="container mx-auto max-w-[1440px] page-enter">
                    {children}
                  </div>
                </div>
              </main>
            </div>
            <Toaster />
            <CommandPalette />
          </ProjectProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
