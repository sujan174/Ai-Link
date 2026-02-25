"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { Fragment } from "react";

const ROUTE_LABELS: Record<string, string> = {
    "audit": "Traffic Inspector",
    "tokens": "Tokens",
    "virtual-keys": "Virtual Keys",
    "credentials": "The Vault",
    "policies": "Policies",
    "approvals": "Approvals",
    "analytics": "Global Analytics",
    "guardrails": "Guardrails",
    "cache": "Cache Management",
    "playground": "Playground",
    "sessions": "Agent Sessions",
    "settings": "Settings",
    "experiments": "Experiments",
};

export function Breadcrumbs() {
    const pathname = usePathname();
    const segments = pathname.split("/").filter(Boolean);

    if (segments.length === 0) return null;

    return (
        <nav className="flex items-center text-[13px] text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">
                <Home className="h-4 w-4" />
            </Link>
            {segments.map((segment, index) => {
                const isLast = index === segments.length - 1;
                const path = `/${segments.slice(0, index + 1).join("/")}`;
                const label = ROUTE_LABELS[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);

                return (
                    <Fragment key={path}>
                        <ChevronRight className="h-3 w-3 mx-1 text-muted-foreground/30" />
                        {isLast ? (
                            <span className="font-semibold text-lg tracking-tight text-foreground truncate max-w-[400px]">
                                {label}
                            </span>
                        ) : (
                            <Link href={path} className="hover:text-foreground transition-colors truncate max-w-[150px]">
                                {label}
                            </Link>
                        )}
                    </Fragment>
                );
            })}
        </nav>
    );
}
