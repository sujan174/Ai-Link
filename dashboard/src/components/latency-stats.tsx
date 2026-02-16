"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getLatencyPercentiles, LatencyStat } from "@/lib/api";
import { Activity } from "lucide-react";

export function LatencyStats() {
    const [stats, setStats] = useState<LatencyStat | null>(null);

    useEffect(() => {
        getLatencyPercentiles().then(setStats)
            .catch(err => console.error("Failed to fetch latency stats", err));
    }, []);

    if (!stats) return null;

    return (
        <div className="grid gap-4 md:grid-cols-3">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">P50 Latency</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{Math.round(stats.p50)}ms</div>
                    <p className="text-xs text-muted-foreground">Median response time</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">P90 Latency</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{Math.round(stats.p90)}ms</div>
                    <p className="text-xs text-muted-foreground">90% of requests faster than</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">P99 Latency</CardTitle>
                    <Activity className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-destructive">{Math.round(stats.p99)}ms</div>
                    <p className="text-xs text-muted-foreground">Outliers / Slowest 1%</p>
                </CardContent>
            </Card>
        </div>
    );
}
