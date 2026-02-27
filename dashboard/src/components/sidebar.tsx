"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
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
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Layers,
    Database,
    ShieldCheck,
    FileCode,
} from "lucide-react";
import { useEffect, useState, useCallback } from "react";

type SidebarProps = React.HTMLAttributes<HTMLDivElement>;

interface Route {
    href: string;
    label: string;
    icon: any;
    badge?: number | null;
}

interface Group {
    id: string;
    label: string;
    routes: Route[];
    defaultOpen?: boolean;
}

export function Sidebar({ className }: SidebarProps) {
    const pathname = usePathname();

    const [collapsed, setCollapsed] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [health, setHealth] = useState<"online" | "offline" | "checking">("checking");
    const [approvalCount, setApprovalCount] = useState(0);
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
        overview: true,
        observe: true,
        orchestrate: false,
        configure: false,
    });

    const toggleGroup = useCallback((id: string) => {
        if (collapsed) return;
        setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));
    }, [collapsed]);

    useEffect(() => {
        setMounted(true);

        const checkHealth = async () => {
            try {
                await fetch("/api/proxy/healthz");
                setHealth("online");
            } catch {
                setHealth("offline");
            }
        };

        const checkApprovals = async () => {
            try {
                const res = await fetch("/api/proxy/approvals");
                if (res.ok) {
                    const data = await res.json();
                    setApprovalCount(data.filter((a: any) => a.status === "pending").length);
                }
            } catch (e) {
                console.error("Failed to fetch approvals", e);
            }
        };

        checkHealth();
        checkApprovals();

        const interval = setInterval(() => {
            checkHealth();
            checkApprovals();
        }, 10000);

        return () => clearInterval(interval);
    }, []);

    // Auto-open group containing current route
    useEffect(() => {
        groups.forEach((group) => {
            const hasActive = group.routes.some(r =>
                r.href === "/" ? pathname === "/" : pathname.startsWith(r.href)
            );
            if (hasActive) {
                setOpenGroups(prev => ({ ...prev, [group.id]: true }));
            }
        });
    }, [pathname]);

    const groups: Group[] = [
        {
            id: "overview",
            label: "Overview",
            defaultOpen: true,
            routes: [
                { href: "/", label: "Dashboard", icon: LayoutDashboard },
                { href: "/analytics", label: "Analytics", icon: BarChart3 },
            ]
        },
        {
            id: "observe",
            label: "Observe",
            defaultOpen: true,
            routes: [
                { href: "/audit", label: "Audit Logs", icon: ClipboardList },
                { href: "/sessions", label: "Sessions", icon: Layers },
            ]
        },
        {
            id: "orchestrate",
            label: "Orchestrate",
            routes: [
                { href: "/virtual-keys", label: "Virtual Keys", icon: Key },
                { href: "/upstreams", label: "Upstreams", icon: Activity },
                { href: "/tools", label: "Tools", icon: Plug },
                { href: "/guardrails", label: "Guardrails", icon: ShieldAlert },
                { href: "/model-access-groups", label: "Model Access", icon: ShieldCheck },
                { href: "/cache", label: "Cache", icon: Database },
                { href: "/approvals", label: "Approvals", icon: CheckCircle, badge: approvalCount > 0 ? approvalCount : null },
                { href: "/playground", label: "Playground", icon: FlaskConical },
            ]
        },
        {
            id: "configure",
            label: "Configure",
            routes: [
                { href: "/vault", label: "Vault", icon: Fingerprint },
                { href: "/api-keys", label: "API Keys", icon: LockKeyhole },
                { href: "/webhooks", label: "Webhooks", icon: Webhook },
                { href: "/billing", label: "Billing", icon: CreditCard },
                { href: "/config", label: "Config-as-Code", icon: FileCode },
                { href: "/settings", label: "Settings", icon: Settings },
            ]
        }
    ];

    return (
        <motion.div
            initial={false}
            animate={{ width: collapsed ? 56 : 220 }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            className={cn(
                "flex h-full flex-col relative overflow-hidden",
                "bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)]",
                className
            )}
        >
            {/* Collapse Toggle */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                aria-label="Toggle Sidebar"
                className={cn(
                    "absolute -right-3 top-7 z-50",
                    "flex h-5 w-5 items-center justify-center rounded-full",
                    "border border-[var(--border)] bg-[var(--card)]",
                    "text-muted-foreground hover:text-foreground",
                    "transition-all duration-200",
                    "hover:border-[var(--primary)]/30"
                )}
            >
                {collapsed ? <ChevronRight size={10} /> : <ChevronLeft size={10} />}
            </button>

            {/* Logo */}
            <div className={cn(
                "flex h-12 shrink-0 items-center border-b border-[var(--sidebar-border)]",
                collapsed ? "justify-center px-3" : "px-4"
            )}>
                <Link href="/" className="flex items-center gap-2 group min-w-0">
                    <div className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                        "bg-gradient-to-br from-teal-500 to-teal-600",
                        "text-white font-bold text-[10px] tracking-tight",
                        "group-hover:shadow-[0_0_12px_rgba(20,184,166,0.3)] transition-shadow"
                    )}>
                        A
                    </div>
                    {!collapsed && (
                        <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="gradient-text font-semibold text-sm tracking-tight whitespace-nowrap"
                        >
                            AIlink
                        </motion.span>
                    )}
                </Link>
            </div>

            {/* Navigation */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 scrollbar-none px-2">
                {groups.map((group) => {
                    const isOpen = openGroups[group.id] ?? group.defaultOpen ?? false;
                    const hasActiveChild = group.routes.some(r =>
                        r.href === "/" ? pathname === "/" : pathname.startsWith(r.href)
                    );

                    return (
                        <div key={group.id} className="mb-0.5">
                            {/* Group header — clickable to collapse */}
                            {!collapsed ? (
                                <button
                                    onClick={() => toggleGroup(group.id)}
                                    className={cn(
                                        "w-full flex items-center justify-between",
                                        "px-2 py-1.5 mt-2 first:mt-0",
                                        "text-[10px] font-medium uppercase tracking-[0.08em]",
                                        "text-muted-foreground/50 hover:text-muted-foreground",
                                        "transition-colors rounded-md"
                                    )}
                                >
                                    <span>{group.label}</span>
                                    <ChevronDown
                                        size={10}
                                        className={cn(
                                            "transition-transform duration-200",
                                            !isOpen && "-rotate-90"
                                        )}
                                    />
                                </button>
                            ) : (
                                <div className="h-px bg-[var(--border)] mx-2 my-2" />
                            )}

                            {/* Routes */}
                            <AnimatePresence initial={false}>
                                {(isOpen || collapsed) && (
                                    <motion.div
                                        initial={collapsed ? false : { height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.15, ease: "easeInOut" }}
                                        className="overflow-hidden space-y-px"
                                    >
                                        {group.routes.map((route) => {
                                            const isActive = route.href === "/"
                                                ? pathname === "/"
                                                : pathname.startsWith(route.href);
                                            return (
                                                <Link
                                                    key={route.href}
                                                    href={route.href}
                                                    title={collapsed ? route.label : undefined}
                                                    className={cn(
                                                        "relative flex items-center gap-2 rounded-md py-1.5 text-[13px] font-medium",
                                                        "transition-all duration-100 group",
                                                        collapsed ? "justify-center px-2" : "px-2",
                                                        isActive
                                                            ? "text-foreground bg-[var(--primary)]/8 border border-[var(--primary)]/12"
                                                            : "text-muted-foreground hover:text-foreground/80 hover:bg-[var(--card)] border border-transparent"
                                                    )}
                                                >
                                                    {/* Active left indicator */}
                                                    {isActive && (
                                                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-3.5 w-[2px] rounded-r-full bg-[var(--primary)]" />
                                                    )}
                                                    <route.icon
                                                        size={14}
                                                        strokeWidth={isActive ? 2 : 1.5}
                                                        className={cn(
                                                            "shrink-0 transition-colors",
                                                            isActive ? "text-[var(--primary)]" : "text-muted-foreground group-hover:text-foreground/60"
                                                        )}
                                                    />
                                                    {!collapsed && (
                                                        <span className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis">
                                                            {route.label}
                                                        </span>
                                                    )}
                                                    {/* Badge */}
                                                    {!collapsed && route.badge && (
                                                        <span className={cn(
                                                            "flex h-4 min-w-[1rem] items-center justify-center rounded-full",
                                                            "bg-amber-500/12 px-1 text-[9px] font-bold text-amber-400 font-mono"
                                                        )}>
                                                            {route.badge}
                                                        </span>
                                                    )}
                                                </Link>
                                            );
                                        })}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    );
                })}
            </div>

            {/* Footer — health + version */}
            <div className={cn(
                "shrink-0 border-t border-[var(--sidebar-border)] py-2.5",
                collapsed ? "px-2" : "px-4"
            )}>
                <div className={cn(
                    "flex items-center text-[11px] text-muted-foreground",
                    collapsed ? "justify-center" : "gap-2"
                )}>
                    <div className={cn(
                        "h-1.5 w-1.5 rounded-full transition-colors duration-500",
                        health === "online" ? "bg-emerald-500" :
                            health === "offline" ? "bg-rose-500" :
                                "bg-amber-500 animate-pulse"
                    )} />
                    {!collapsed && (
                        <span className="font-mono text-[10px] text-muted-foreground/60">v0.6.0</span>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
