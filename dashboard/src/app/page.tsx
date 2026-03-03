"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { swrFetcher, AuditLog, Token, ApprovalRequest, AnalyticsTimeseriesPoint, AnomalyResponse } from "@/lib/api";
import {
    Activity,
    Zap,
    Key,
    DollarSign,
    ArrowUpRight,
    TrendingUp,
    TrendingDown,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    AlertOctagon,
    Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { toast } from "sonner";
import { CustomTooltip, CHART_AXIS_PROPS } from "@/components/ui/chart-utils";

type Credential = { id: string };

export default function OverviewPage() {
    const { data: logs = [], isLoading: logsLoading } = useSWR<AuditLog[]>("/audit?limit=100", swrFetcher, { refreshInterval: 5000 });
    const { data: tokens = [], isLoading: tokensLoading } = useSWR<Token[]>("/tokens", swrFetcher);
    const { data: credentials = [], isLoading: credentialsLoading } = useSWR<Credential[]>("/credentials", swrFetcher);
    const { data: approvals = [], isLoading: approvalsLoading } = useSWR<ApprovalRequest[]>("/approvals", swrFetcher, { refreshInterval: 10000 });
    const { data: usage, isLoading: usageLoading } = useSWR<any>("/billing/usage", swrFetcher, { refreshInterval: 10000 });
    const { data: latencySeries = [], isLoading: latencyLoading } = useSWR<AnalyticsTimeseriesPoint[]>("/analytics/timeseries?range=168", swrFetcher, { refreshInterval: 10000 });
    const { data: anomalyData } = useSWR<AnomalyResponse>("/anomalies", swrFetcher, { refreshInterval: 15000 });

    const loading = logsLoading || tokensLoading || credentialsLoading || approvalsLoading || usageLoading || latencyLoading;

    // Computed metrics
    const totalRequests = usage ? Number(usage.total_requests || 0) : 0;
    const avgLatency = logs.length > 0
        ? Math.round(logs.reduce((sum, l) => sum + l.response_latency_ms, 0) / logs.length)
        : 0;
    const activeTokens = tokens.filter(t => t.is_active).length;
    const totalSpend = usage ? Number(usage.total_spend_usd || 0) : 0;
    const pendingApprovals = approvals.filter(a => a.status === "pending").length;
    const successRate = logs.length > 0
        ? Math.round((logs.filter(l => l.upstream_status && l.upstream_status < 400).length / logs.length) * 100)
        : 0;

    const recent5xxErrors = logs.filter(l => l.upstream_status && l.upstream_status >= 500).length;
    let alertMessage = null;
    if (logs.length > 0) {
        if (recent5xxErrors > 0) {
            alertMessage = `${recent5xxErrors} provider errors (5xx) detected in recent traffic`;
        } else if (successRate < 98 && logs.length > 10) {
            alertMessage = `Success rate dropped to ${successRate}%`;
        }
    }

    const formatDate = (dateStr: any) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    const recentLogs = logs.slice(0, 8);
    const anomalousCount = anomalyData?.events?.filter(e => e.is_anomalous).length ?? 0;

    return (
        <div className="space-y-6 max-w-[1440px] mx-auto">
            {/* Page header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">Real-time gateway overview</p>
                </div>
                {!loading && (
                    <div className="flex items-center gap-2 text-xs md:text-[10px] text-muted-foreground/60 font-mono">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Live
                    </div>
                )}
            </div>

            {/* ── KPI Strip ── */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                <MetricCard
                    label="Requests"
                    value={totalRequests.toLocaleString()}
                    sub="this month"
                    loading={loading}
                    accent="teal"
                />
                <MetricCard
                    label="Active Tokens"
                    value={activeTokens.toString()}
                    sub={`${tokens.length} total`}
                    loading={loading}
                    accent="blue"
                />
                <MetricCard
                    label="Avg Latency"
                    value={`${avgLatency}ms`}
                    sub={avgLatency < 200 ? "excellent" : avgLatency < 500 ? "good" : "high"}
                    loading={loading}
                    accent="emerald"
                    trend={avgLatency > 0 ? (avgLatency < 300 ? "up" : "down") : undefined}
                />
                <MetricCard
                    label="Spend"
                    value={`$${totalSpend.toFixed(4)}`}
                    sub="this month"
                    loading={loading}
                    accent="amber"
                />
            </div>

            {/* ── Status Strip (ordered: problems first, reassurance last) ── */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
                {/* Anomalies — lead with problems */}
                <div className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3">
                    <div className="flex-1">
                        <p className="text-xs md:text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Anomalies</p>
                        <p className={cn(
                            "text-lg font-semibold tabular-nums tracking-tight font-mono mt-0.5",
                            anomalousCount > 0 ? "text-rose-400" : "text-foreground"
                        )}>
                            {anomalousCount}
                        </p>
                    </div>
                    {anomalousCount > 0 && (
                        <div className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                    )}
                </div>

                {/* Pending Approvals */}
                <Link href="/approvals" className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3 hover:border-amber-500/20 transition-colors group">
                    <div className="flex-1">
                        <p className="text-xs md:text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Pending Approvals</p>
                        <p className="text-lg font-semibold tabular-nums tracking-tight font-mono mt-0.5">
                            {loading ? "—" : pendingApprovals}
                        </p>
                    </div>
                    {pendingApprovals > 0 && (
                        <span className="text-xs md:text-[10px] text-amber-400 flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                            Review <ArrowUpRight className="h-3 w-3" />
                        </span>
                    )}
                </Link>

                {/* Success Rate — end with reassurance */}
                <div className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3">
                    <div className="flex-1">
                        <p className="text-xs md:text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Success Rate</p>
                        <p className={cn(
                            "text-lg font-semibold tabular-nums tracking-tight font-mono mt-0.5",
                            successRate >= 95 ? "text-emerald-400" : successRate >= 80 ? "text-amber-400" : "text-rose-400"
                        )}>
                            {loading ? "—" : `${successRate}%`}
                        </p>
                    </div>
                    <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
                        <div
                            className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                            style={{ width: `${successRate}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* ── Alert Banner ── */}
            {!loading && alertMessage && (
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-3 animate-fade-in flex items-center gap-3 text-sm">
                    <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                    <span className="text-rose-300">{alertMessage}</span>
                </div>
            )}

            {/* ── Latency Chart (full width) ── */}
            <Card className="animate-slide-up stagger-3">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Latency Trend
                    </CardTitle>
                    <span className="text-[10px] text-muted-foreground/50 font-mono">7 days</span>
                </CardHeader>
                <CardContent className="min-h-[220px]">
                    {loading ? (
                        <div className="h-[220px] w-full flex items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/20" />
                        </div>
                    ) : latencySeries.length > 0 ? (
                        <div className="h-[180px] md:h-[220px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={latencySeries} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid stroke="var(--border, #1e2330)" strokeDasharray="3 3" vertical={false} />
                                    <XAxis
                                        dataKey="bucket"
                                        tickFormatter={formatDate}
                                        {...CHART_AXIS_PROPS}
                                        minTickGap={40}
                                    />
                                    <YAxis
                                        domain={[0, 'auto']}
                                        tickFormatter={(val: any) => `${val}ms`}
                                        {...CHART_AXIS_PROPS}
                                    />
                                    <Tooltip
                                        content={<CustomTooltip
                                            labelFormatter={formatDate}
                                            valueFormatter={(val: any) => `${val}ms`}
                                        />}
                                        cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '4 4' }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="avg_latency_ms"
                                        name="Latency"
                                        stroke="var(--primary, #6366f1)"
                                        strokeWidth={1.5}
                                        fillOpacity={1}
                                        fill="url(#colorLatency)"
                                        isAnimationActive={false}
                                        activeDot={{ r: 3, strokeWidth: 0, fill: 'var(--primary, #6366f1)' }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-[220px] w-full flex items-center justify-center text-xs text-muted-foreground">
                            No latency data yet
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── Recent Activity ── */}
            <Card className="animate-slide-up stagger-5">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Recent Traces
                    </CardTitle>
                    <Link href="/audit">
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1">
                            View all <ArrowUpRight className="h-3 w-3" />
                        </Button>
                    </Link>
                </CardHeader>
                <div className="max-h-[340px] overflow-y-auto">
                    {loading ? (
                        <div className="divide-y divide-border">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-3 px-4 py-3">
                                    <div className="h-1.5 w-1.5 rounded-full bg-muted/50 shimmer" />
                                    <div className="flex-1 space-y-1">
                                        <div className="h-2.5 w-40 bg-muted/50 rounded shimmer" />
                                    </div>
                                    <div className="h-2.5 w-10 bg-muted/50 rounded shimmer" />
                                </div>
                            ))}
                        </div>
                    ) : recentLogs.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground">
                            <Activity className="h-5 w-5 mx-auto mb-2 opacity-20" />
                            <p className="text-xs">No activity yet. Send a request to see it here.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border/40">
                            {recentLogs.map((log) => (
                                <div
                                    key={log.id}
                                    className="flex items-center gap-3 px-4 py-3 hover:bg-card/60 transition-colors text-xs"
                                >
                                    <StatusDot status={log.upstream_status} result={log.policy_result} />

                                    {/* Desktop: single-row grid */}
                                    <div className="hidden md:grid flex-1 min-w-0 grid-cols-4 gap-3 items-center">
                                        <div className="col-span-2 font-mono text-[11px] truncate text-foreground/70">
                                            <span className="font-semibold text-muted-foreground mr-1.5">{log.method}</span>
                                            {log.path}
                                        </div>
                                        <div className="col-span-1 text-[11px] text-muted-foreground truncate">
                                            {log.agent_name || "—"}
                                        </div>
                                        <div className="col-span-1 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                                            {log.response_latency_ms}ms
                                        </div>
                                    </div>

                                    <div className="hidden md:flex items-center gap-3 min-w-[100px] justify-end">
                                        {log.estimated_cost_usd && parseFloat(log.estimated_cost_usd) > 0 && (
                                            <span className="text-[10px] font-mono text-muted-foreground/60">
                                                ${parseFloat(log.estimated_cost_usd).toFixed(5)}
                                            </span>
                                        )}
                                        <span className="text-[10px] text-muted-foreground/40 w-14 text-right tabular-nums font-mono">
                                            {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>

                                    {/* Mobile: two-line layout */}
                                    <div className="flex-1 min-w-0 md:hidden">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-mono text-xs truncate text-foreground/70">
                                                <span className="font-semibold text-muted-foreground mr-1">{log.method}</span>
                                                {log.path}
                                            </span>
                                            <span className="text-xs text-muted-foreground/40 tabular-nums font-mono shrink-0">
                                                {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between gap-2 mt-1">
                                            <span className="text-xs text-muted-foreground truncate">
                                                {log.agent_name || "—"}
                                            </span>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-xs font-mono text-muted-foreground tabular-nums">
                                                    {log.response_latency_ms}ms
                                                </span>
                                                {log.estimated_cost_usd && parseFloat(log.estimated_cost_usd) > 0 && (
                                                    <span className="text-xs font-mono text-muted-foreground/60">
                                                        ${parseFloat(log.estimated_cost_usd).toFixed(5)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}

// ── Sub-components ──────────────────────────────

function MetricCard({
    label,
    value,
    sub,
    loading,
    accent,
    trend,
}: {
    label: string;
    value: string;
    sub: string;
    loading?: boolean;
    accent: "teal" | "emerald" | "blue" | "amber" | "rose";
    trend?: "up" | "down";
}) {
    const accentColors = {
        teal: "text-teal-400",
        emerald: "text-emerald-400",
        blue: "text-blue-400",
        amber: "text-amber-400",
        rose: "text-rose-400",
    };

    return (
        <div className="bg-card border border-border rounded-lg p-4 hover-lift animate-slide-up">
            <p className="text-xs md:text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                {label}
            </p>
            {loading ? (
                <div className="h-7 w-20 bg-muted/50 rounded shimmer mt-1" />
            ) : (
                <div className="flex items-baseline gap-2 mt-1">
                    <p className="text-xl font-semibold tabular-nums tracking-tight font-mono">
                        {value}
                    </p>
                    {trend && (
                        <span className={cn("flex items-center gap-0.5 text-xs md:text-[10px] font-medium",
                            trend === "up" ? "text-emerald-400" : "text-rose-400"
                        )}>
                            {trend === "up" ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                        </span>
                    )}
                </div>
            )}
            <p className="text-xs md:text-[10px] text-muted-foreground/60 mt-0.5">{sub}</p>
        </div>
    );
}

function StatusDot({ status, result }: { status: number | null; result: string }) {
    if (result === "blocked") {
        return <div className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />;
    }
    if (result === "shadow_violation") {
        return <div className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />;
    }
    if (status && status >= 200 && status < 400) {
        return <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />;
    }
    return <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 shrink-0" />;
}
