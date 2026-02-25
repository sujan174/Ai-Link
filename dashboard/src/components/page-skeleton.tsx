"use client";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Reusable skeleton for pages with KPI cards + data table layout.
 */
export function PageSkeleton({
    cards = 4,
    rows = 6,
}: {
    cards?: number;
    rows?: number;
}) {
    return (
        <div className="space-y-6 animate-in fade-in-50">
            {/* KPI card skeletons */}
            <div className={`grid gap-3 grid-cols-${cards}`}>
                {Array.from({ length: cards }).map((_, i) => (
                    <div
                        key={i}
                        className="rounded-md border border-border/60 bg-card/50 backdrop-blur-sm p-4 flex items-center gap-3"
                    >
                        <Skeleton className="h-10 w-10 rounded-md" />
                        <div className="space-y-2 flex-1">
                            <Skeleton className="h-3 w-20" />
                            <Skeleton className="h-5 w-16" />
                        </div>
                    </div>
                ))}
            </div>

            {/* Table skeleton */}
            <div className="rounded-md border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
                {/* Header */}
                <div className="flex items-center border-b px-4 py-3 gap-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-4 flex-1" />
                    ))}
                </div>
                {/* Rows */}
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="flex items-center border-b border-border/30 px-4 py-3 gap-4">
                        {Array.from({ length: 5 }).map((_, j) => (
                            <Skeleton
                                key={j}
                                className={`h-4 flex-1 ${j === 0 ? "max-w-[80px]" : ""}`}
                            />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
