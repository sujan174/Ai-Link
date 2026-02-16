"use client";

import { useState, useEffect, useCallback } from "react";
import { listAuditLogs, listTokens, listApprovals, AuditLog, Token, ApprovalRequest } from "@/lib/api";
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function OverviewPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [tokens, setTokens] = useState<Token[]>([]);
    const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchAll = useCallback(async () => {
        try {
            setLoading(true);
            const [logsData, tokensData, approvalsData] = await Promise.all([
                listAuditLogs(100, 0),
                listTokens(),
                listApprovals(),
            ]);
            setLogs(logsData);
            setTokens(tokensData);
            setApprovals(approvalsData);
        } catch (e) {
            console.error("Failed to load overview data", e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();
        const interval = setInterval(fetchAll, 10000); // Auto-refresh every 10s
        return () => clearInterval(interval);
    }, [fetchAll]);

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

    const recentLogs = logs.slice(0, 8);

    return (
        <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="space-y-1 animate-fade-in">
                <h2 className="text-3xl font-bold tracking-tight">
                    Command Center
                </h2>
                <p className="text-muted-foreground">
                    Real-time overview of your AI gateway
                </p>
            </div>

            {/* KPI Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KPICard
                    title="Total Requests"
                    value={totalRequests.toLocaleString()}
                    subtitle="Last 100 logged"
                    icon={Activity}
                    iconColor="blue"
                    delay={0}
                />
                <KPICard
                    title="Avg Latency"
                    value={`${avgLatency}ms`}
                    subtitle={avgLatency < 200 ? "Excellent" : avgLatency < 500 ? "Good" : "Needs attention"}
                    icon={Zap}
                    iconColor="emerald"
                    delay={1}
                />
                <KPICard
                    title="Active Tokens"
                    value={activeTokens.toString()}
                    subtitle={`${tokens.length - activeTokens} revoked`}
                    icon={Key}
                    iconColor="violet"
                    delay={2}
                />
                <KPICard
                    title="Total Spend"
                    value={`$${totalSpend.toFixed(4)}`}
                    subtitle="Visible costs"
                    icon={DollarSign}
                    iconColor="amber"
                    delay={3}
                />
            </div>

            {/* Second Row */}
            <div className="grid gap-4 md:grid-cols-3">
                {/* Success Rate */}
                <Card className="glass-card hover-lift animate-slide-up stagger-4">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Success Rate
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-end gap-3">
                            <span className={cn(
                                "text-4xl font-bold tabular-nums",
                                successRate >= 95 ? "text-emerald-500" : successRate >= 80 ? "text-amber-500" : "text-rose-500"
                            )}>
                                {successRate}%
                            </span>
                            <div className="flex items-center gap-1 text-xs text-emerald-500 mb-1">
                                <TrendingUp className="h-3 w-3" />
                                healthy
                            </div>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-1000"
                                style={{ width: `${successRate}%` }}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Pending Approvals */}
                <Card className="glass-card hover-lift animate-slide-up stagger-5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Pending Approvals
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <span className={cn(
                                "text-4xl font-bold tabular-nums",
                                pendingApprovals > 0 ? "text-amber-500 animate-pulse" : "text-muted-foreground"
                            )}>
                                {pendingApprovals}
                            </span>
                            {pendingApprovals > 0 && (
                                <Link
                                    href="/approvals"
                                    className="flex items-center gap-1 text-xs text-amber-500 hover:text-amber-400 transition-colors"
                                >
                                    Review now
                                    <ArrowUpRight className="h-3 w-3" />
                                </Link>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            {pendingApprovals > 0
                                ? "Human-in-the-loop requests waiting"
                                : "All requests have been reviewed"}
                        </p>
                    </CardContent>
                </Card>

                {/* Security Status */}
                <Card className="glass-card hover-lift animate-slide-up stagger-5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Security Status
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2 mb-3">
                            <ShieldCheck className="h-5 w-5 text-emerald-500" />
                            <span className="text-sm font-medium text-emerald-500">All Systems Secure</span>
                        </div>
                        <div className="space-y-1.5 text-xs text-muted-foreground">
                            <div className="flex items-center gap-2">
                                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                AES-256-GCM encryption active
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                PII redaction enabled
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                Memory zeroize active
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Activity */}
            <Card className="glass-card animate-slide-up">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-lg">Recent Activity</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">Latest requests through the gateway</p>
                    </div>
                    <Link
                        href="/audit"
                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                    >
                        View all
                        <ArrowUpRight className="h-3 w-3" />
                    </Link>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
                                    <div className="h-8 w-8 rounded-lg bg-muted/50 shimmer" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-3 w-48 bg-muted/50 rounded shimmer" />
                                        <div className="h-2 w-24 bg-muted/50 rounded shimmer" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : recentLogs.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Activity className="h-8 w-8 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No activity yet. Send a request through the gateway to get started.</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {recentLogs.map((log, i) => (
                                <div
                                    key={log.id}
                                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/30 transition-colors group"
                                    style={{ animationDelay: `${i * 0.05}s` }}
                                >
                                    <StatusIcon status={log.upstream_status} result={log.policy_result} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-sm font-medium truncate">
                                                {log.method} {log.path}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                            <span>{log.response_latency_ms}ms</span>
                                            {log.agent_name && (
                                                <span className="truncate">• {log.agent_name}</span>
                                            )}
                                            <span>• {new Date(log.created_at).toLocaleTimeString()}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {log.estimated_cost_usd && parseFloat(log.estimated_cost_usd) > 0 && (
                                            <span className="text-xs font-mono text-muted-foreground">
                                                ${parseFloat(log.estimated_cost_usd).toFixed(4)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
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
}: {
    title: string;
    value: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
    iconColor: "blue" | "emerald" | "violet" | "amber" | "rose";
    delay: number;
}) {
    return (
        <Card className={cn("glass-card hover-lift animate-slide-up", `stagger-${delay + 1}`)}>
            <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">
                            {title}
                        </p>
                        <p className="text-3xl font-bold tabular-nums tracking-tight">
                            {value}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {subtitle}
                        </p>
                    </div>
                    <div className={`icon-circle-${iconColor}`}>
                        <Icon className="h-5 w-5" />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function StatusIcon({ status, result }: { status: number | null; result: string }) {
    if (result === "blocked") {
        return (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10">
                <XCircle className="h-4 w-4 text-rose-500" />
            </div>
        );
    }
    if (result === "shadow_violation") {
        return (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
        );
    }
    if (status && status >= 200 && status < 400) {
        return (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
        );
    }
    return (
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
            <Activity className="h-4 w-4 text-muted-foreground" />
        </div>
    );
}
