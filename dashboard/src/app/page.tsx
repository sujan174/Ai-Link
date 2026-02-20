"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { swrFetcher, AuditLog, Token, ApprovalRequest } from "@/lib/api";
import {
    Activity,
    Zap,
    Key,
    DollarSign,
    ArrowUpRight,
    ShieldCheck,
    TrendingUp,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Database,
    Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

export default function OverviewPage() {
    // SWR Hooks for real-time data
    const { data: logs = [], isLoading: logsLoading } = useSWR<AuditLog[]>("/audit-logs?limit=100", swrFetcher, { refreshInterval: 5000 });
    const { data: tokens = [], isLoading: tokensLoading } = useSWR<Token[]>("/tokens", swrFetcher);
    const { data: credentials = [], isLoading: credentialsLoading } = useSWR<Credential[]>("/credentials", swrFetcher);
    const { data: approvals = [], isLoading: approvalsLoading } = useSWR<ApprovalRequest[]>("/approvals", swrFetcher, { refreshInterval: 10000 });

    // UI State
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (typeof window !== "undefined") {
            setDismissed(localStorage.getItem("dismissed_onboarding") === "true");
        }
    }, []);

    const loading = logsLoading || tokensLoading || credentialsLoading || approvalsLoading;

    // Computed metrics
    const totalRequests = logs.length;
    const avgLatency = logs.length > 0
        ? Math.round(logs.reduce((sum, l) => sum + l.response_latency_ms, 0) / logs.length)
        : 0;
    const activeTokens = tokens.filter(t => t.is_active).length;
    const totalSpend = logs.reduce((sum, l) => sum + parseFloat(l.estimated_cost_usd || "0"), 0);
    const pendingApprovals = approvals.filter(a => a.status === "pending").length;
    const successRate = logs.length > 0
        ? Math.round((logs.filter(l => l.upstream_status && l.upstream_status < 400).length / logs.length) * 100)
        : 0;
    const cacheableLogs = logs.filter(l => l.cache_hit !== null && l.cache_hit !== undefined);
    const cacheHitRate = cacheableLogs.length > 0
        ? Math.round((cacheableLogs.filter(l => l.cache_hit).length / cacheableLogs.length) * 100)
        : null;

    const recentLogs = logs.slice(0, 8);

    // Prepare chart data (simple latency trend over last 20 requests)
    const chartData = logs.slice(0, 50).reverse().map((l, i) => ({
        index: i,
        latency: l.response_latency_ms,
        status: l.upstream_status
    }));

    return (
        <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="space-y-1 animate-fade-in flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">
                        Command Center
                    </h2>
                    <p className="text-muted-foreground">
                        Real-time overview of your AI gateway
                    </p>
                </div>
                {!loading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
                        <div className="h-2 w-2 rounded-full bg-emerald-500" />
                        Live
                    </div>
                )}
            </div>

            {/* Onboarding State */}
            {!loading && totalRequests === 0 && !dismissed ? (
                <Card className="border-dashed border-2 bg-muted/20 animate-fade-in mb-8 relative">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-4 top-4 h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                            localStorage.setItem("dismissed_onboarding", "true");
                            setDismissed(true);
                        }}
                    >
                        <span className="sr-only">Dismiss</span>
                        <XCircle className="h-4 w-4" />
                    </Button>
                    <CardHeader className="text-center pb-2">
                        <CardTitle className="text-2xl font-bold flex items-center justify-center gap-2">
                            <Zap className="h-6 w-6 text-primary" />
                            Welcome to AILink
                        </CardTitle>
                        <p className="text-muted-foreground max-w-lg mx-auto">
                            Complete these three steps to secure your first AI agent.
                        </p>
                    </CardHeader>
                    <CardContent className="py-6 max-w-3xl mx-auto w-full">
                        <div className="space-y-6">
                            {/* Step 1 */}
                            <div className="flex gap-4 items-start">
                                <div className={cn("mt-1 flex h-8 w-8 items-center justify-center rounded-full border-2", credentials.length > 0 ? "border-emerald-500 bg-emerald-500/10 text-emerald-500" : "border-primary bg-primary/10 text-primary")}>
                                    {credentials.length > 0 ? <CheckCircle2 className="h-5 w-5" /> : <span>1</span>}
                                </div>
                                <div className="space-y-1.5 flex-1">
                                    <h3 className="font-semibold text-lg flex items-center gap-2">
                                        Add a Provider Credential
                                        {credentials.length > 0 && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">Complete</span>}
                                    </h3>
                                    <p className="text-sm text-muted-foreground">Securely store an OpenAI, Anthropic, or Gemini API key in the vault.</p>
                                    {credentials.length === 0 && (
                                        <div className="pt-2">
                                            <Link href="/credentials"><Button size="sm">Add Credential</Button></Link>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Step 2 */}
                            <div className={cn("flex gap-4 items-start transition-opacity", credentials.length === 0 && "opacity-50 grayscale")}>
                                <div className={cn("mt-1 flex h-8 w-8 items-center justify-center rounded-full border-2", tokens.length > 0 ? "border-emerald-500 bg-emerald-500/10 text-emerald-500" : credentials.length > 0 ? "border-primary bg-primary/10 text-primary" : "border-muted text-muted-foreground")}>
                                    {tokens.length > 0 ? <CheckCircle2 className="h-5 w-5" /> : <span>2</span>}
                                </div>
                                <div className="space-y-1.5 flex-1">
                                    <h3 className="font-semibold text-lg flex items-center gap-2">
                                        Create an isolated Token
                                        {tokens.length > 0 && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">Complete</span>}
                                    </h3>
                                    <p className="text-sm text-muted-foreground">Mint a virtual token (`ailink_v1_...`) bound to your credential. Give this to your agent.</p>
                                    {credentials.length > 0 && tokens.length === 0 && (
                                        <div className="pt-2">
                                            <Link href="/tokens"><Button size="sm">Create Token</Button></Link>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Step 3 */}
                            <div className={cn("flex gap-4 items-start transition-opacity", tokens.length === 0 && "opacity-50 grayscale")}>
                                <div className={cn("mt-1 flex h-8 w-8 items-center justify-center rounded-full border-2", "border-primary bg-primary/10 text-primary")}>
                                    <span>3</span>
                                </div>
                                <div className="space-y-1.5 flex-1 w-full overflow-hidden">
                                    <h3 className="font-semibold text-lg flex items-center gap-2">
                                        Send your first proxy request
                                    </h3>
                                    <p className="text-sm text-muted-foreground">Use this pre-filled curl command. The gateway will inject the real key and log the request below.</p>

                                    <div className="w-full bg-muted/80 rounded-lg p-4 text-left font-mono text-xs relative group mt-3 overflow-x-auto">
                                        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => {
                                                navigator.clipboard.writeText(`curl -X POST http://localhost:8443/v1/chat/completions \\
  -H "Authorization: Bearer ${tokens[0]?.id || 'YOUR_TOKEN'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello AILink!"}]
  }'`);
                                                toast.success("Command copied!");
                                            }}>Copy</Button>
                                        </div>
                                        <span className="text-violet-400">curl</span> -X POST http://localhost:8443/v1/chat/completions \<br />
                                        &nbsp;&nbsp;-H <span className="text-emerald-400">"Authorization: Bearer {tokens[0]?.id || 'YOUR_TOKEN'}"</span> \<br />
                                        &nbsp;&nbsp;-H <span className="text-emerald-400">"Content-Type: application/json"</span> \<br />
                                        &nbsp;&nbsp;-d <span className="text-amber-400">'{`\n    "model": "gpt-4o-mini",\n    "messages": [{"role": "user", "content": "Hello AILink!"}]\n  `}'</span>
                                    </div>
                                    <div className="pt-3">
                                        <Link href="https://github.com/sujan174/ailink/blob/main/sdk/python/README.md" target="_blank">
                                            <Button variant="outline" size="sm">View Python SDK Setup</Button>
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                /* KPI Grid */
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <KPICard
                        title="Total Requests"
                        value={totalRequests.toLocaleString()}
                        subtitle="Last 100 logged"
                        icon={Activity}
                        iconColor="blue"
                        delay={0}
                        loading={loading}
                    />
                    <KPICard
                        title="Avg Latency"
                        value={`${avgLatency}ms`}
                        subtitle={avgLatency < 200 ? "Excellent" : avgLatency < 500 ? "Good" : "High"}
                        icon={Zap}
                        iconColor="emerald"
                        delay={1}
                        loading={loading}
                        trend={avgLatency > 500 ? "down" : "up"}
                    />
                    <KPICard
                        title="Active Tokens"
                        value={activeTokens.toString()}
                        subtitle={`${tokens.length} total tokens`}
                        icon={Key}
                        iconColor="violet"
                        delay={2}
                        loading={loading}
                    />
                    <KPICard
                        title="Visible Spend"
                        value={`$${totalSpend.toFixed(4)}`}
                        subtitle="Estimated cost"
                        icon={DollarSign}
                        iconColor="amber"
                        delay={3}
                        loading={loading}
                    />
                </div>
            )}

            {/* Main Content Grid */}
            <div className="grid gap-6 md:grid-cols-7">

                {/* Latency Chart (Span 4) */}
                <Card className="md:col-span-4 glass-card animate-slide-up stagger-3 flex flex-col">
                    <CardHeader>
                        <CardTitle className="text-sm font-medium text-muted-foreground">Latency Trend (Last 50)</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 min-h-[250px]">
                        {loading ? (
                            <div className="h-full w-full flex items-center justify-center">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/30" />
                            </div>
                        ) : chartData.length > 0 ? (
                            <div className="h-[250px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData}>
                                        <defs>
                                            <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="index" hide />
                                        <YAxis hide domain={['auto', 'auto']} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'var(--card)', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12px' }}
                                            labelStyle={{ display: 'none' }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="latency"
                                            stroke="#10b981"
                                            strokeWidth={2}
                                            fillOpacity={1}
                                            fill="url(#colorLatency)"
                                            isAnimationActive={false}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground/50">
                                <Activity className="h-8 w-8 mb-2 opacity-20" />
                                <span className="text-xs">No data available</span>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Status Cards (Span 3) */}
                <div className="md:col-span-3 space-y-4">
                    {/* Success Rate */}
                    <Card className="glass-card animate-slide-up stagger-4">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                Success Rate
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-end gap-3">
                                <span className={cn(
                                    "text-4xl font-bold tabular-nums tracking-tighter",
                                    successRate >= 95 ? "text-emerald-500" : successRate >= 80 ? "text-amber-500" : "text-rose-500"
                                )}>
                                    {loading ? "..." : `${successRate}%`}
                                </span>
                                <div className="flex items-center gap-1 text-xs text-emerald-500 mb-1.5 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                    <TrendingUp className="h-3 w-3" />
                                    Healthy
                                </div>
                            </div>
                            <div className="mt-4 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-all duration-1000"
                                    style={{ width: `${successRate}%` }}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Pending Approvals */}
                    <Card className="glass-card animate-slide-up stagger-5">
                        <CardHeader className="pb-2 flex flex-row items-center justify-between">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                Approvals
                            </CardTitle>
                            {pendingApprovals > 0 && (
                                <Link href="/approvals" className="text-xs text-amber-500 hover:text-amber-400 flex items-center gap-1">
                                    Review <ArrowUpRight className="h-3 w-3" />
                                </Link>
                            )}
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-4">
                                <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center",
                                    pendingApprovals > 0 ? "bg-amber-500/10 text-amber-500 animate-pulse" : "bg-muted text-muted-foreground")}>
                                    <ShieldCheck className="h-5 w-5" />
                                </div>
                                <div>
                                    <div className="text-2xl font-bold tabular-nums">
                                        {loading ? "-" : pendingApprovals}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        Pending requests
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Recent Activity List */}
            <Card className="glass-card animate-slide-up stagger-5">
                <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
                    <div>
                        <CardTitle className="text-lg">Recent Traces</CardTitle>
                    </div>
                </CardHeader>
                <div className="max-h-[400px] overflow-y-auto">
                    {loading ? (
                        <div className="space-y-0divide-y divide-border/50">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-4 p-4">
                                    <div className="h-8 w-8 rounded-lg bg-muted/50 shimmer" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-3 w-48 bg-muted/50 rounded shimmer" />
                                    </div>
                                    <div className="h-3 w-12 bg-muted/50 rounded shimmer" />
                                </div>
                            ))}
                        </div>
                    ) : recentLogs.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Activity className="h-8 w-8 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No activity yet. Send a request to see it here.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border/40">
                            {recentLogs.map((log) => (
                                <div
                                    key={log.id}
                                    className="flex items-center gap-4 p-3 px-6 hover:bg-muted/30 transition-colors group text-sm"
                                >
                                    <StatusIcon status={log.upstream_status} result={log.policy_result} />

                                    <div className="flex-1 min-w-0 grid grid-cols-4 gap-4 items-center">
                                        <div className="col-span-2 font-mono text-xs truncate text-foreground/80">
                                            <span className="font-bold text-muted-foreground mr-2">{log.method}</span>
                                            {log.path}
                                        </div>
                                        <div className="col-span-1 text-xs text-muted-foreground truncate">
                                            {log.agent_name || "—"}
                                        </div>
                                        <div className="col-span-1 text-right font-mono text-xs text-muted-foreground">
                                            {log.response_latency_ms}ms
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4 min-w-[120px] justify-end">
                                        {log.estimated_cost_usd && parseFloat(log.estimated_cost_usd) > 0 && (
                                            <span className="text-xs font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">
                                                ${parseFloat(log.estimated_cost_usd).toFixed(5)}
                                            </span>
                                        )}
                                        <span className="text-xs text-muted-foreground w-16 text-right tabular-nums">
                                            {new Date(log.created_at).toLocaleTimeString()}
                                        </span>
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

function KPICard({
    title,
    value,
    subtitle,
    icon: Icon,
    iconColor,
    delay,
    loading,
    trend
}: {
    title: string;
    value: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
    iconColor: "blue" | "emerald" | "violet" | "amber" | "rose";
    delay: number;
    loading?: boolean;
    trend?: "up" | "down";
}) {
    const colors = {
        blue: "text-blue-500 bg-blue-500/10",
        emerald: "text-emerald-500 bg-emerald-500/10",
        violet: "text-violet-500 bg-violet-500/10",
        amber: "text-amber-500 bg-amber-500/10",
        rose: "text-rose-500 bg-rose-500/10",
    };

    return (
        <Card className={cn("glass-card hover-lift animate-slide-up", `stagger-${delay + 1}`)}>
            <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                    <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {title}
                        </p>
                        {loading ? (
                            <div className="h-8 w-24 bg-muted/50 rounded shimmer my-1" />
                        ) : (
                            <p className="text-2xl font-bold tabular-nums tracking-tight font-mono">
                                {value}
                            </p>
                        )}
                        <p className="text-[11px] text-muted-foreground">
                            {subtitle}
                        </p>
                    </div>
                    <div className={cn("p-2 rounded-lg", colors[iconColor])}>
                        <Icon className="h-4 w-4" />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function StatusIcon({ status, result }: { status: number | null; result: string }) {
    if (result === "blocked") {
        return <XCircle className="h-4 w-4 text-rose-500 shrink-0" />;
    }
    if (result === "shadow_violation") {
        return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />;
    }
    if (status && status >= 200 && status < 400) {
        return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />;
    }
    return <Activity className="h-4 w-4 text-muted-foreground shrink-0" />;
}
