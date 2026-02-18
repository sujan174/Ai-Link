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
    Plug,
} from "lucide-react";
import { ProjectSwitcher } from "@/components/project-switcher";
import { useEffect, useState } from "react";

type SidebarProps = React.HTMLAttributes<HTMLDivElement>;

export function Sidebar({ className }: SidebarProps) {
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();


    const [mounted, setMounted] = useState(false);
    const [health, setHealth] = useState<"online" | "offline" | "checking">("checking");
    const [approvalCount, setApprovalCount] = useState(0);

    useEffect(() => {
        setMounted(true);

        const checkHealth = async () => {
            try {
                // We'll just check if the promise resolves
                await fetch("/api/proxy/healthz");
                setHealth("online");
            } catch {
                setHealth("offline");
            }
        };

        const checkApprovals = async () => {
            try {
                // This fetches all approvals - efficiently we'd want a count endpoint but this works for v1
                const res = await fetch("/api/proxy/approvals");
                if (res.ok) {
                    const data = await res.json();
                    setApprovalCount(data.filter((a: any) => a.status === "pending").length);
                }
            } catch (e) {
                console.error("Failed to fetch approvals", e);
            }
        };

        // Initial check
        checkHealth();
        checkApprovals();

        // Poll every 30s
        const interval = setInterval(() => {
            checkHealth();
            checkApprovals();
        }, 10000);

        return () => clearInterval(interval);
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
            badge: null,
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
            href: "/services",
            label: "Services",
            icon: Plug,
        },
        {
            href: "/approvals",
            label: "Approvals",
            icon: CheckCircle,
            badge: approvalCount > 0 ? approvalCount : null,
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
                                <span className="flex-1">{route.label}</span>
                                {route.badge && (
                                    <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500/15 px-1.5 text-[10px] font-bold text-amber-500 transition-all">
                                        {route.badge}
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
                    <span className="font-mono">v0.6.0</span>
                    <div className="flex items-center gap-1.5" title={health === "online" ? "Gateway connected" : "Gateway unreachable"}>
                        <div className={cn(
                            "h-2 w-2 rounded-full transition-colors duration-500",
                            health === "online" ? "bg-emerald-500 animate-pulse" :
                                health === "offline" ? "bg-rose-500" : "bg-amber-500"
                        )} />
                        <span>{health === "online" ? "Online" : health === "offline" ? "Offline" : "Checking..."}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
