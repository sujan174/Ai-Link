"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { Fragment } from "react";

const ROUTE_LABELS: Record<string, string> = {
    "audit": "Traffic Inspector",
    "tokens": "Tokens",
    "credentials": "Credentials",
    "policies": "Policies",
    "approvals": "Approvals",
    "analytics": "Analytics",
};

export function Breadcrumbs() {
    const pathname = usePathname();
    const segments = pathname.split("/").filter(Boolean);

    if (segments.length === 0) return null;

    return (
        <nav className="flex items-center text-sm text-muted-foreground mb-4">
            <Link href="/" className="hover:text-foreground transition-colors">
                <Home className="h-4 w-4" />
            </Link>
            {segments.map((segment, index) => {
                const isLast = index === segments.length - 1;
                const path = `/${segments.slice(0, index + 1).join("/")}`;
                const label = ROUTE_LABELS[segment] || segment;

                return (
                    <Fragment key={path}>
                        <ChevronRight className="h-4 w-4 mx-1 text-muted-foreground/50" />
                        {isLast ? (
                            <span className="font-medium text-foreground truncate max-w-[200px]">
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
