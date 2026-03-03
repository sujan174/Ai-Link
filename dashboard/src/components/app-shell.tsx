"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { MobileNav } from "@/components/mobile-nav";
import dynamic from "next/dynamic";

const CommandPalette = dynamic(() => import("@/components/command-palette").then(m => m.CommandPalette), { loading: () => null });
const NotificationBell = dynamic(() => import("@/components/notification-bell").then(m => m.NotificationBell), { loading: () => null });
const ProjectSwitcher = dynamic(() => import("@/components/project-switcher").then(m => m.ProjectSwitcher), { loading: () => null });
const OnboardingModal = dynamic(() => import("@/components/onboarding-modal").then(m => m.OnboardingModal), { loading: () => null });

/**
 * Renders the full app chrome (sidebar + topbar) on authenticated pages,
 * or a bare canvas on /login.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLogin = pathname === "/login";

    if (isLogin) {
        return <>{children}</>;
    }

    return (
        <>
            <div className="flex h-full w-full">
                <Sidebar className="hidden border-r md:flex" />
                <main className="flex-1 flex flex-col overflow-hidden">
                    <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border bg-background/90 px-4 backdrop-blur-sm">
                        <div className="flex items-center gap-2 flex-1">
                            <MobileNav />
                            <Breadcrumbs />
                        </div>
                        <div className="flex items-center gap-2">
                            <ProjectSwitcher className="hidden md:flex w-[180px] h-7" />
                            <NotificationBell />
                        </div>
                    </header>
                    <div className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6">
                        <div className="container mx-auto max-w-[1440px] page-enter">
                            {children}
                        </div>
                    </div>
                </main>
            </div>
            <CommandPalette />
            <OnboardingModal />
        </>
    );
}
