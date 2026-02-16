"use client";

import { useState, useEffect, useCallback } from "react";
import { listAuditLogs, AuditLog } from "@/lib/api";
import {
    RefreshCw,
    TrendingUp,
    DollarSign,
    Activity,
    Zap,
    ArrowUpRight,
    ArrowDownRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    Cell,
    PieChart,
    Pie,
} from "recharts";

export default function AnalyticsPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const data = await listAuditLogs(500, 0);
            setLogs(data);
        } catch {
            toast.error("Failed to load analytics data");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Process data for charts
    const spendData = logs.reduce((acc, log) => {
        if (!log.estimated_cost_usd) return acc;
        const time = new Date(log.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
        const cost = parseFloat(log.estimated_cost_usd);
        const existing = acc.find((d) => d.time === time);
        if (existing) {
            existing.cost += cost;
            existing.requests += 1;
        } else {
            acc.push({ time, cost, requests: 1 });
        }
        return acc;
    }, [] as { time: string; cost: number; requests: number }[]).reverse();

    // Latency distribution
    const latencyBuckets = [
        { range: "<100ms", count: 0, color: "#10b981" },
        { range: "100-300ms", count: 0, color: "#06b6d4" },
        { range: "300-500ms", count: 0, color: "#3b82f6" },
        { range: "500ms-1s", count: 0, color: "#f59e0b" },
        { range: ">1s", count: 0, color: "#ef4444" },
    ];
    logs.forEach((log) => {
        const ms = log.response_latency_ms;
        if (ms < 100) latencyBuckets[0].count++;
        else if (ms < 300) latencyBuckets[1].count++;
        else if (ms < 500) latencyBuckets[2].count++;
        else if (ms < 1000) latencyBuckets[3].count++;
        else latencyBuckets[4].count++;
    });

    // Status distribution
    const statusCounts = logs.reduce((acc, log) => {
        const cls = log.upstream_status
            ? `${Math.floor(log.upstream_status / 100)}xx`
            : "N/A";
        acc[cls] = (acc[cls] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const statusData = Object.entries(statusCounts).map(([name, value]) => ({
        name,
        value,
        color:
            name === "2xx" ? "#10b981" :
                name === "3xx" ? "#06b6d4" :
                    name === "4xx" ? "#f59e0b" :
                        name === "5xx" ? "#ef4444" :
                            "#71717a",
    }));

    const totalSpend = logs.reduce(
        (sum, log) => sum + parseFloat(log.estimated_cost_usd || "0"),
        0
    );
    const avgLatency =
        logs.reduce((sum, log) => sum + log.response_latency_ms, 0) /
        (logs.length || 1);
    const p99Latency = logs.length > 0
        ? [...logs].sort((a, b) => b.response_latency_ms - a.response_latency_ms)[Math.floor(logs.length * 0.01)]?.response_latency_ms || 0
        : 0;

    return (
        <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between animate-fade-in">
                <div className="space-y-1">
                    <h2 className="text-3xl font-bold tracking-tight">Analytics</h2>
                    <p className="text-muted-foreground">
                        Cost analysis and performance metrics
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
                    <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                    Refresh
                </Button>
            </div>

            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="glass-card hover-lift animate-slide-up stagger-1">
                    <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Total Spend</p>
                                <p className="text-3xl font-bold mt-1 gradient-text-emerald tabular-nums">
                                    ${totalSpend.toFixed(4)}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {logs.length} requests analyzed
                                </p>
                            </div>
                            <div className="icon-circle-emerald">
                                <DollarSign className="h-5 w-5" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="glass-card hover-lift animate-slide-up stagger-2">
                    <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Avg Latency</p>
                                <p className="text-3xl font-bold mt-1 tabular-nums">
                                    {Math.round(avgLatency)}
                                    <span className="text-lg text-muted-foreground">ms</span>
                                </p>
                                <div className="flex items-center gap-1 mt-1">
                                    {avgLatency < 300 ? (
                                        <ArrowDownRight className="h-3 w-3 text-emerald-500" />
                                    ) : (
                                        <ArrowUpRight className="h-3 w-3 text-rose-500" />
                                    )}
                                    <span className={cn("text-xs", avgLatency < 300 ? "text-emerald-500" : "text-rose-500")}>
                                        {avgLatency < 300 ? "Fast" : "Slow"}
                                    </span>
                                </div>
                            </div>
                            <div className="icon-circle-blue">
                                <Zap className="h-5 w-5" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="glass-card hover-lift animate-slide-up stagger-3">
                    <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">P99 Latency</p>
                                <p className="text-3xl font-bold mt-1 tabular-nums">
                                    {Math.round(p99Latency)}
                                    <span className="text-lg text-muted-foreground">ms</span>
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Worst 1% of requests
                                </p>
                            </div>
                            <div className="icon-circle-amber">
                                <Activity className="h-5 w-5" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="glass-card hover-lift animate-slide-up stagger-4">
                    <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Request Volume</p>
                                <p className="text-3xl font-bold mt-1 tabular-nums">
                                    {logs.length}
                                </p>
                                <div className="flex items-center gap-1 mt-1">
                                    <TrendingUp className="h-3 w-3 text-emerald-500" />
                                    <span className="text-xs text-emerald-500">Active</span>
                                </div>
                            </div>
                            <div className="icon-circle-violet">
                                <TrendingUp className="h-5 w-5" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Charts */}
            <div className="grid gap-4 md:grid-cols-2">
                {/* Spend Over Time */}
                <Card className="glass-card animate-slide-up stagger-4">
                    <CardHeader>
                        <CardTitle className="text-base">Spend Over Time</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={spendData}>
                                <defs>
                                    <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
                                <XAxis dataKey="time" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                                <Tooltip
                                    contentStyle={{
                                        background: "var(--card)",
                                        border: "1px solid var(--border)",
                                        borderRadius: "8px",
                                        fontSize: "12px",
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="cost"
                                    stroke="#10b981"
                                    strokeWidth={2}
                                    fill="url(#spendGradient)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Request Volume */}
                <Card className="glass-card animate-slide-up stagger-5">
                    <CardHeader>
                        <CardTitle className="text-base">Request Volume</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={spendData}>
                                <defs>
                                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#3b82f6" />
                                        <stop offset="100%" stopColor="#8b5cf6" />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
                                <XAxis dataKey="time" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                                <Tooltip
                                    contentStyle={{
                                        background: "var(--card)",
                                        border: "1px solid var(--border)",
                                        borderRadius: "8px",
                                        fontSize: "12px",
                                    }}
                                />
                                <Bar dataKey="requests" fill="url(#barGradient)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Bottom Row */}
            <div className="grid gap-4 md:grid-cols-2">
                {/* Latency Distribution */}
                <Card className="glass-card animate-slide-up">
                    <CardHeader>
                        <CardTitle className="text-base">Latency Distribution</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={latencyBuckets} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
                                <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                                <YAxis dataKey="range" type="category" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={80} />
                                <Tooltip
                                    contentStyle={{
                                        background: "var(--card)",
                                        border: "1px solid var(--border)",
                                        borderRadius: "8px",
                                        fontSize: "12px",
                                    }}
                                />
                                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                                    {latencyBuckets.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Status Code Distribution */}
                <Card className="glass-card animate-slide-up">
                    <CardHeader>
                        <CardTitle className="text-base">Status Codes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-center h-[240px]">
                            <ResponsiveContainer width="50%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={statusData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={50}
                                        outerRadius={80}
                                        paddingAngle={4}
                                        dataKey="value"
                                    >
                                        {statusData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{
                                            background: "var(--card)",
                                            border: "1px solid var(--border)",
                                            borderRadius: "8px",
                                            fontSize: "12px",
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="space-y-3">
                                {statusData.map((entry) => (
                                    <div key={entry.name} className="flex items-center gap-3">
                                        <div
                                            className="h-3 w-3 rounded-full"
                                            style={{ backgroundColor: entry.color }}
                                        />
                                        <span className="text-sm font-mono">{entry.name}</span>
                                        <span className="text-sm font-bold tabular-nums">{entry.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
