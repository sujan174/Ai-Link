"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
    Key,
    ShieldAlert,
    CheckCircle,
    ClipboardList,
    Fingerprint,
    BarChart3,
    LayoutDashboard,
    Plug,
    CreditCard,
    LockKeyhole,
    Activity,
    Webhook,
    FlaskConical,
    Settings,
    User,
    ChevronLeft,
    ChevronRight,
    Map,
    DollarSign,
    Layers,
    Database,
} from "lucide-react";
import { useEffect, useState } from "react";

type SidebarProps = React.HTMLAttributes<HTMLDivElement>;

interface Route {
    href: string;
    label: string;
    icon: any;
    badge?: number | null;
}

interface Group {
    label: string;
    routes: Route[];
}

export function Sidebar({ className }: SidebarProps) {
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();

    // Collapsed state
    const [collapsed, setCollapsed] = useState(false);
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

    const groups: Group[] = [
        {
            label: "Overview",
            routes: [
                { href: "/", label: "Command Centre", icon: LayoutDashboard },
            ]
        },
        {
            label: "Observability",
            routes: [
                { href: "/analytics", label: "Global Analytics", icon: BarChart3 },
                { href: "/audit", label: "Audit Logs", icon: ClipboardList },
                { href: "/sessions", label: "Agent Sessions", icon: Layers },
            ]
        },
        {
            label: "Orchestration",
            routes: [
                { href: "/virtual-keys", label: "Virtual Keys", icon: Key },
                { href: "/upstreams", label: "Upstreams & Models", icon: Activity },
                { href: "/tools", label: "Managed Tools", icon: Plug },
                { href: "/approvals", label: "Human-in-the-Loop", icon: CheckCircle, badge: approvalCount > 0 ? approvalCount : null },
            ]
        },
        {
            label: "Safety & Optimization",
            routes: [
                { href: "/guardrails", label: "Guardrails", icon: ShieldAlert },
                { href: "/cache", label: "Cache Management", icon: Database },
                { href: "/playground", label: "Playground", icon: FlaskConical },
            ]
        },
        {
            label: "Configuration",
            routes: [
                { href: "/vault", label: "The Vault", icon: Fingerprint },
                { href: "/api-keys", label: "Platform API Keys", icon: LockKeyhole },
                { href: "/webhooks", label: "Webhooks", icon: Webhook },
                { href: "/billing", label: "Usage & Billing", icon: CreditCard },
                { href: "/settings", label: "Settings", icon: Settings },
            ]
        }
    ];

    return (
        <motion.div
            initial={false}
            animate={{ width: collapsed ? 80 : 256 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={cn("flex h-full flex-col bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)] relative", className)}
        >
            {/* Collapse Toggle */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                aria-label="Toggle Sidebar"
                className="absolute -right-3 top-6 z-50 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] text-muted-foreground shadow-sm hover:text-foreground hover:shadow-md transition-all"
            >
                {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>

            {/* Header */}
            <div className={cn("flex flex-col gap-4 border-b border-[var(--sidebar-border)] transition-all", collapsed ? "p-2" : "p-4")}>
                <Link href="/" className={cn("flex items-center gap-2.5 font-bold text-lg group", collapsed ? "justify-center" : "px-2")}>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-violet-600 text-white text-sm font-black shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-shadow">
                        A
                    </div>
                    {!collapsed && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-2 whitespace-nowrap overflow-hidden"
                        >
                            <span className="gradient-text font-bold text-lg tracking-tight">
                                AIlink
                            </span>
                            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-500 tracking-wider uppercase">
                                Gateway
                            </span>
                        </motion.div>
                    )}
                </Link>
            </div>

            {/* Navigation */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-4 scrollbar-none">
                {groups.map((group) => (
                    <div key={group.label} className="space-y-1">
                        {!collapsed && (
                            <motion.h4
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="px-3 text-[10px] uppercase font-bold tracking-[0.1em] text-muted-foreground/60 mb-1 whitespace-nowrap"
                            >
                                {group.label}
                            </motion.h4>
                        )}
                        {group.routes.map((route) => {
                            const isActive = route.href === "/"
                                ? pathname === "/"
                                : pathname.startsWith(route.href);
                            return (
                                <Link
                                    key={route.href}
                                    href={route.href}
                                    className={cn(
                                        "flex items-center gap-2.5 rounded-md py-1.5 text-sm font-medium transition-all duration-200 group relative",
                                        collapsed ? "justify-center px-2" : "px-3",
                                        isActive
                                            ? "text-primary bg-primary/10"
                                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                    )}
                                    title={collapsed ? route.label : undefined}
                                >
                                    {isActive && (
                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-r-full bg-primary" />
                                    )}
                                    <route.icon
                                        size={16}
                                        strokeWidth={1.5}
                                        className={cn("shrink-0 transition-colors", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}
                                    />
                                    {!collapsed && (
                                        <motion.span
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis"
                                        >
                                            {route.label}
                                        </motion.span>
                                    )}
                                    {!collapsed && route.badge && (
                                        <motion.span
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500/15 px-1.5 text-[10px] font-bold text-amber-500 transition-all font-mono"
                                        >
                                            {route.badge}
                                        </motion.span>
                                    )}
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div className="border-t border-[var(--sidebar-border)] p-4 space-y-1">
                <div className={cn("py-2 transition-all", collapsed ? "px-0 flex justify-center" : "px-3")}>
                    <div className={cn("flex items-center text-xs text-muted-foreground", collapsed ? "justify-center" : "justify-between")}>
                        <div className="flex items-center gap-2">
                            <div className={cn(
                                "h-2 w-2 rounded-full transition-colors duration-500 shrink-0",
                                health === "online" ? "bg-emerald-500 animate-pulse" :
                                    health === "offline" ? "bg-rose-500" : "bg-amber-500"
                            )} />
                            {!collapsed && <span className="font-mono">v0.6.0</span>}
                        </div>
                        {!collapsed && <span className="text-[10px] uppercase tracking-wider opacity-50">{health}</span>}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
