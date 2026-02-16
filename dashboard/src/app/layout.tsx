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
                <div className="page-enter">
                  {children}
                </div>
              </main>
            </div>
            <Toaster />
          </ProjectProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
