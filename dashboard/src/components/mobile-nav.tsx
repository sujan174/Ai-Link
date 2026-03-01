"use client";

import { useState, useEffect } from "react";
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
    Menu,
    FlaskConical,
    Activity,
    LockKeyhole,
    Settings,
    Layers,
} from "lucide-react";
import { ProjectSwitcher } from "@/components/project-switcher";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogTrigger,
} from "@/components/ui/dialog";

export function MobileNav() {
    const [open, setOpen] = useState(false);
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Close on navigation
    useEffect(() => {
        setOpen(false);
    }, [pathname]);

    const groups = [
        {
            label: "Overview",
            routes: [
                { href: "/", label: "Dashboard", icon: LayoutDashboard },
                { href: "/analytics", label: "Analytics", icon: BarChart3 },
                { href: "/audit", label: "Audit Logs", icon: ClipboardList },
                { href: "/sessions", label: "Sessions", icon: Layers },
            ]
        },
        {
            label: "Operate",
            routes: [
                { href: "/virtual-keys", label: "Agents", icon: Key },
                { href: "/upstreams", label: "Upstreams", icon: Activity },
                { href: "/guardrails", label: "Guardrails", icon: ShieldAlert },
                { href: "/playground", label: "Playground", icon: FlaskConical },
                { href: "/approvals", label: "Approvals", icon: CheckCircle },
            ]
        },
        {
            label: "Configure",
            routes: [
                { href: "/vault", label: "Vault", icon: Fingerprint },
                { href: "/api-keys", label: "API Keys", icon: LockKeyhole },
                { href: "/settings", label: "Settings", icon: Settings },
            ]
        }
    ];

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Toggle menu</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="fixed inset-y-0 left-0 z-50 h-full w-3/4 max-w-sm gap-4 border-r bg-background p-4 shadow-xl transition-transform animate-slide-right sm:max-w-xs overflow-y-auto">
                <div className="flex flex-col gap-3 h-full">
                    {/* Logo */}
                    <div className="flex items-center gap-2 font-bold text-lg">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-teal-500 to-teal-600 text-white text-sm font-black">
                            A
                        </div>
                        <span className="gradient-text font-semibold">
                            AIlink
                        </span>
                    </div>

                    <ProjectSwitcher />

                    <nav className="flex flex-col gap-3 flex-1">
                        {groups.map((group) => (
                            <div key={group.label} className="flex flex-col gap-1">
                                <h4 className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                    {group.label}
                                </h4>
                                {group.routes.map((route) => {
                                    const isActive = route.href === "/"
                                        ? pathname === "/"
                                        : pathname.startsWith(route.href);
                                    return (
                                        <Link
                                            key={route.href}
                                            href={route.href}
                                            className={cn(
                                                "flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors",
                                                isActive
                                                    ? "bg-primary/10 text-primary"
                                                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            <route.icon className={cn("h-4 w-4", isActive && "text-primary")} />
                                            {route.label}
                                        </Link>
                                    );
                                })}
                            </div>
                        ))}
                    </nav>

                    {/* Footer */}
                    <div className="mt-auto border-t pt-4">
                        {mounted && (
                            <button
                                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13px] text-muted-foreground hover:bg-muted"
                            >
                                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                                {theme === "dark" ? "Light Mode" : "Dark Mode"}
                            </button>
                        )}
                        <div className="mt-4 px-3 text-xs text-muted-foreground">
                            v0.6.0
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
