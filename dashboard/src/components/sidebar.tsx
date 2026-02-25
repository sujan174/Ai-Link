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

    const [collapsed, setCollapsed] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [health, setHealth] = useState<"online" | "offline" | "checking">("checking");
    const [approvalCount, setApprovalCount] = useState(0);

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
                { href: "/settings/sso", label: "SSO / OIDC", icon: ShieldAlert },
                { href: "/billing", label: "Usage & Billing", icon: CreditCard },
                { href: "/settings", label: "Settings", icon: Settings },
            ]
        }
    ];

    return (
        <motion.div
            initial={false}
            animate={{ width: collapsed ? 64 : 232 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
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
                    "flex h-6 w-6 items-center justify-center rounded-full",
                    "border border-[#2C2C35] bg-[#1A1A1F]",
                    "text-[#8A8A96] hover:text-[#F0F0F4]",
                    "shadow-md transition-all duration-200",
                    "hover:border-[#7C3AED]/30 hover:shadow-[0_0_12px_rgba(124,58,237,0.2)]"
                )}
            >
                {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
            </button>

            {/* Logo / Brand */}
            <div className={cn(
                "flex h-14 shrink-0 items-center border-b border-[var(--sidebar-border)]",
                collapsed ? "justify-center px-4" : "px-5"
            )}>
                <Link href="/" className="flex items-center gap-2.5 group min-w-0">
                    {/* Icon mark */}
                    <div className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                        "bg-gradient-to-br from-violet-600 to-indigo-500",
                        "text-white font-black text-xs shadow-lg",
                        "shadow-violet-900/40 group-hover:shadow-violet-700/40 transition-shadow"
                    )}>
                        A
                    </div>
                    {!collapsed && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-2 min-w-0 overflow-hidden"
                        >
                            <span className="gradient-text font-bold text-[15px] tracking-tight whitespace-nowrap">
                                AIlink
                            </span>
                            <span className={cn(
                                "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider whitespace-nowrap",
                                "bg-violet-500/10 text-violet-400 border border-violet-500/20"
                            )}>
                                Gateway
                            </span>
                        </motion.div>
                    )}
                </Link>
            </div>

            {/* Navigation */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-5 scrollbar-none px-3">
                {groups.map((group) => (
                    <div key={group.label} className="space-y-0.5">
                        {/* Group label */}
                        {!collapsed && (
                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className={cn(
                                    "px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]",
                                    "text-[#8A8A96]/60"
                                )}
                            >
                                {group.label}
                            </motion.p>
                        )}
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
                                        "relative flex items-center gap-2.5 rounded-lg py-2 text-[13px] font-medium",
                                        "transition-all duration-150 group",
                                        collapsed ? "justify-center px-2" : "px-2.5",
                                        isActive
                                            ? [
                                                "text-[#F0F0F4] bg-violet-600/10",
                                                "ring-1 ring-inset ring-violet-500/15"
                                            ]
                                            : [
                                                "text-[#8A8A96]",
                                                "hover:text-[#C8C8D4] hover:bg-[#1E1E24]"
                                            ]
                                    )}
                                >
                                    {/* Active left indicator */}
                                    {isActive && (
                                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-r-full bg-violet-500 shadow-[0_0_6px_rgba(124,58,237,0.7)]" />
                                    )}
                                    <route.icon
                                        size={15}
                                        strokeWidth={isActive ? 2 : 1.6}
                                        className={cn(
                                            "shrink-0 transition-colors",
                                            isActive ? "text-violet-400" : "text-[#8A8A96] group-hover:text-[#C8C8D4]"
                                        )}
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
                                    {/* approval badge */}
                                    {!collapsed && route.badge && (
                                        <motion.span
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className={cn(
                                                "flex h-4 min-w-[1rem] items-center justify-center rounded-full",
                                                "bg-amber-500/15 px-1 text-[9px] font-bold text-amber-400 font-mono"
                                            )}
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

            {/* Footer — health status */}
            <div className={cn(
                "shrink-0 border-t border-[var(--sidebar-border)] py-3",
                collapsed ? "px-3" : "px-5"
            )}>
                <div className={cn(
                    "flex items-center text-[11px] text-[#8A8A96]",
                    collapsed ? "justify-center" : "justify-between"
                )}>
                    <div className="flex items-center gap-2">
                        <div className={cn(
                            "h-1.5 w-1.5 rounded-full transition-colors duration-500",
                            health === "online" ? "bg-emerald-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]" :
                                health === "offline" ? "bg-rose-500" :
                                    "bg-amber-500 animate-pulse"
                        )} />
                        {!collapsed && <span className="font-mono text-[10px]">v0.6.0</span>}
                    </div>
                    {!collapsed && (
                        <span className={cn(
                            "text-[9px] uppercase tracking-widest font-medium",
                            health === "online" ? "text-emerald-500/60" :
                                health === "offline" ? "text-rose-500/60" :
                                    "text-amber-500/60"
                        )}>
                            {health}
                        </span>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
