import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { ProjectProvider } from "@/contexts/project-context";
import { ThemeProvider } from "next-themes";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "AIlink Dashboard",
  description: "Manage tokens, approvals, and audit logs for the AIlink Gateway",
};

import { Breadcrumbs } from "@/components/breadcrumbs";
import { CommandPalette } from "@/components/command-palette";
import { MobileNav } from "@/components/mobile-nav";
import { NotificationBell } from "@/components/notification-bell";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} flex h-screen w-full bg-background font-sans antialiased text-foreground`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <ProjectProvider>
            <div className="flex h-full w-full">
              <Sidebar className="hidden border-r md:flex" />
              <main className="flex-1 overflow-y-auto">
                <div className="container mx-auto p-6 max-w-[1600px]">
                  <div className="flex items-center gap-2 mb-6">
                    <MobileNav />
                    <div className="flex-1">
                      <Breadcrumbs />
                    </div>
                    <NotificationBell />
                  </div>
                  <div className="page-enter">
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
