"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import {
    Key,
    ShieldAlert,
    CheckCircle,
    ClipboardList,
    Fingerprint,
    BarChart3,
    LayoutDashboard,
    Moon,
    Sun,
} from "lucide-react";
import { ProjectSwitcher } from "@/components/project-switcher";
import { useEffect, useState } from "react";

type SidebarProps = React.HTMLAttributes<HTMLDivElement>;

export function Sidebar({ className }: SidebarProps) {
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();


    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const routes = [
        {
            href: "/",
            label: "Overview",
            icon: LayoutDashboard,
        },
        {
            href: "/audit",
            label: "Audit Logs",
            icon: ClipboardList,
        },
        {
            href: "/analytics",
            label: "Analytics",
            icon: BarChart3,
        },
        {
            href: "/tokens",
            label: "Tokens",
            icon: Key,
        },
        {
            href: "/credentials",
            label: "Credentials",
            icon: Fingerprint,
        },
        {
            href: "/policies",
            label: "Policies",
            icon: ShieldAlert,
        },
        {
            href: "/approvals",
            label: "Approvals",
            icon: CheckCircle,
        },
    ];

    return (
        <div className={cn("flex h-full w-64 flex-col bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)]", className)}>
            {/* Logo */}
            <div className="flex h-16 items-center border-b border-[var(--sidebar-border)] px-6">
                <Link href="/" className="flex items-center gap-2.5 font-bold text-lg group">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 text-white text-sm font-black shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-shadow">
                        A
                    </div>
                    <span className="gradient-text font-bold text-lg tracking-tight">
                        AIlink
                    </span>
                    <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-500 tracking-wider uppercase">
                        Gateway
                    </span>
                </Link>
            </div>

            {/* Project Switcher */}
            <div className="px-4 pt-4">
                <ProjectSwitcher />
            </div>

            {/* Navigation */}
            <div className="flex-1 overflow-auto py-4">
                <nav className="grid gap-1 px-3">
                    <span className="mb-2 px-3 text-[10px] uppercase font-bold tracking-[0.15em] text-muted-foreground/60">
                        Platform
                    </span>
                    {routes.map((route) => {
                        const isActive = route.href === "/"
                            ? pathname === "/"
                            : pathname.startsWith(route.href);
                        return (
                            <Link
                                key={route.href}
                                href={route.href}
                                className={cn(
                                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                                    isActive
                                        ? "bg-primary/10 text-primary shadow-sm"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                )}
                            >
                                <route.icon className={cn("h-4 w-4", isActive && "text-primary")} />
                                {route.label}
                                {route.label === "Approvals" && (
                                    <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/15 text-[10px] font-bold text-amber-500">
                                        •
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            {/* Footer */}
            <div className="border-t border-[var(--sidebar-border)] p-4 space-y-3">
                {/* Dark Mode Toggle */}
                {mounted && (
                    <button
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    >
                        {theme === "dark" ? (
                            <Sun className="h-4 w-4" />
                        ) : (
                            <Moon className="h-4 w-4" />
                        )}
                        {theme === "dark" ? "Light Mode" : "Dark Mode"}
                    </button>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground px-3">
                    <span className="font-mono">v0.1.0</span>
                    <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Online</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
