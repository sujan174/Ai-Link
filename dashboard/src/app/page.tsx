"use client";

import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import { swrFetcher, AuditLog, Token, ApprovalRequest, AnalyticsTimeseriesPoint, AnomalyResponse } from "@/lib/api";
import {
    Activity,
    ArrowUpRight,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    Loader2,
    Zap,
    Shield,
    Clock,
    DollarSign,
    ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { CountUp } from "@/components/ui/count-up";

type Credential = { id: string };

// ── Custom tooltip for charts ──────────────────────────────────────────────
function MissionTooltip({ active, payload, label, valueFormatter }: {
    active?: boolean;
    payload?: Array<{ value: number; name: string }>;
    label?: string;
    valueFormatter?: (v: number) => string;
}) {
    if (!active || !payload?.length) return null;
    const val = payload[0]?.value;
    return (
        <div className="mission-tooltip">
            <div className="mission-tooltip-label">{label}</div>
            {val !== undefined && (
                <div className="mission-tooltip-value">
                    {valueFormatter ? valueFormatter(val) : val}
                </div>
            )}
        </div>
    );
}

export default function OverviewPage() {
    const { data: logs = [], isLoading: logsLoading } = useSWR<AuditLog[]>("/audit?limit=100", swrFetcher, { refreshInterval: 5000 });
    const { data: tokens = [], isLoading: tokensLoading } = useSWR<Token[]>("/tokens", swrFetcher);
    const { data: credentials = [], isLoading: credentialsLoading } = useSWR<Credential[]>("/credentials", swrFetcher);
    const { data: approvals = [], isLoading: approvalsLoading } = useSWR<ApprovalRequest[]>("/approvals", swrFetcher, { refreshInterval: 10000 });
    const { data: usage, isLoading: usageLoading } = useSWR<Record<string, number | string>>("/billing/usage", swrFetcher, { refreshInterval: 10000 });
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

    // Health state: nominal | degraded | critical
    const healthState = recent5xxErrors > 0 ? "critical"
        : successRate < 98 && logs.length > 10 ? "degraded"
        : "nominal";

    const formatDate = (dateStr: string | number) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    const recentLogs = logs.slice(0, 8);
    const anomalousCount = anomalyData?.events?.filter(e => e.is_anomalous).length ?? 0;

    return (
        <div className="overview-root">
            {/* ── Horizon Health Bar ── */}
            <HorizonBar state={healthState} loading={loading} />

            {/* ── Page Header ── */}
            <div className="overview-header">
                <div className="overview-header-left">
                    <div className="overview-header-eyebrow">
                        <span className="eyebrow-tick" />
                        GATEWAY OVERVIEW
                    </div>
                    <h1 className="overview-title">Mission Control</h1>
                </div>
                <div className="overview-header-right">
                    {!loading && (
                        <div className={cn("live-badge", healthState)}>
                            <span className="live-dot" />
                            <span className="live-label">
                                {healthState === "nominal" ? "NOMINAL" : healthState === "degraded" ? "DEGRADED" : "CRITICAL"}
                            </span>
                        </div>
                    )}
                    {loading && (
                        <div className="live-badge loading">
                            <Loader2 className="live-loader" />
                            <span className="live-label">SYNCING</span>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Alert Banner ── */}
            {!loading && alertMessage && (
                <div className="alert-banner">
                    <AlertTriangle className="alert-icon" />
                    <span className="alert-text">{alertMessage}</span>
                    <div className="alert-pulse" />
                </div>
            )}

            {/* ── KPI Grid ── */}
            <div className="kpi-grid">
                <KpiCard
                    label="TOTAL REQUESTS"
                    value={totalRequests}
                    sub="this month"
                    icon={<Zap className="kpi-icon-svg" />}
                    loading={loading}
                    delay={0}
                    accent="cyan"
                />
                <KpiCard
                    label="ACTIVE TOKENS"
                    value={activeTokens}
                    sub={`${tokens.length} total`}
                    icon={<Shield className="kpi-icon-svg" />}
                    loading={loading}
                    delay={1}
                    accent="emerald"
                />
                <KpiCard
                    label="AVG LATENCY"
                    value={avgLatency}
                    suffix="ms"
                    sub={avgLatency < 200 ? "excellent" : avgLatency < 500 ? "good" : "high"}
                    icon={<Clock className="kpi-icon-svg" />}
                    loading={loading}
                    delay={2}
                    accent={avgLatency > 500 ? "amber" : "cyan"}
                    trend={avgLatency > 0 ? (avgLatency < 300 ? "up" : "down") : undefined}
                />
                <KpiCard
                    label="TOTAL SPEND"
                    value={totalSpend}
                    prefix="$"
                    decimals={4}
                    sub="this month"
                    icon={<DollarSign className="kpi-icon-svg" />}
                    loading={loading}
                    delay={3}
                    accent="amber"
                />
            </div>

            {/* ── Status Row ── */}
            <div className="status-row">
                {/* Anomalies */}
                <div className={cn("status-card", anomalousCount > 0 && "status-card--alert")}>
                    <div className="status-card-label">ANOMALIES</div>
                    <div className={cn("status-card-value", anomalousCount > 0 ? "text-rose-400" : "text-emerald-400")}>
                        {loading ? <span className="status-skeleton" /> : <CountUp value={anomalousCount} duration={800} />}
                    </div>
                    {anomalousCount > 0 && <div className="status-pulse status-pulse--rose" />}
                </div>

                {/* Pending Approvals */}
                <Link href="/approvals" className="status-card status-card--link">
                    <div className="status-card-label">PENDING APPROVALS</div>
                    <div className={cn("status-card-value", pendingApprovals > 0 ? "text-amber-400" : "text-white")}>
                        {loading ? <span className="status-skeleton" /> : <CountUp value={pendingApprovals} duration={800} />}
                    </div>
                    {pendingApprovals > 0 && (
                        <div className="status-card-cta">
                            Review <ChevronRight className="h-3 w-3" />
                        </div>
                    )}
                </Link>

                {/* Success Rate */}
                <div className="status-card">
                    <div className="status-card-label">SUCCESS RATE</div>
                    <div className={cn(
                        "status-card-value",
                        successRate >= 95 ? "text-emerald-400" : successRate >= 80 ? "text-amber-400" : "text-rose-400"
                    )}>
                        {loading ? <span className="status-skeleton" /> : <CountUp value={successRate} suffix="%" duration={1200} />}
                    </div>
                    <div className="success-bar-track">
                        <div
                            className={cn("success-bar-fill",
                                successRate >= 95 ? "success-bar-fill--green" : successRate >= 80 ? "success-bar-fill--amber" : "success-bar-fill--red"
                            )}
                            style={{ width: `${successRate}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* ── Charts Row ── */}
            <div className="charts-row">
                {/* Latency Chart */}
                <div className="chart-panel chart-panel--wide">
                    <div className="chart-header">
                        <div className="chart-title">LATENCY TREND</div>
                        <div className="chart-range">7 days · 1h buckets</div>
                    </div>
                    <div className="chart-body">
                        {loading ? (
                            <div className="chart-empty">
                                <Loader2 className="chart-loader" />
                            </div>
                        ) : latencySeries.length > 0 ? (
                            <ResponsiveContainer width="100%" height={220}>
                                <AreaChart data={latencySeries} margin={{ top: 10, right: 4, left: -28, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.3} />
                                            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid stroke="rgba(34,211,238,0.06)" strokeDasharray="4 6" vertical={false} />
                                    <XAxis
                                        dataKey="bucket"
                                        tickFormatter={formatDate}
                                        stroke="rgba(34,211,238,0.15)"
                                        tick={{ fill: 'rgba(100,200,220,0.5)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                                        minTickGap={48}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        domain={[0, 'auto']}
                                        tickFormatter={(val: number) => `${val}`}
                                        stroke="rgba(34,211,238,0.15)"
                                        tick={{ fill: 'rgba(100,200,220,0.5)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip
                                        content={<MissionTooltip valueFormatter={(v) => `${v}ms`} />}
                                        cursor={{ stroke: 'rgba(34,211,238,0.2)', strokeWidth: 1, strokeDasharray: '4 4' }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="avg_latency_ms"
                                        name="Latency"
                                        stroke="#22d3ee"
                                        strokeWidth={1.5}
                                        fillOpacity={1}
                                        fill="url(#latencyGrad)"
                                        isAnimationActive={true}
                                        animationDuration={1400}
                                        animationEasing="ease-out"
                                        activeDot={{ r: 4, strokeWidth: 0, fill: '#22d3ee', filter: 'drop-shadow(0 0 8px rgba(34,211,238,0.8))' }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="chart-empty">
                                <Activity className="chart-empty-icon" />
                                <span>No latency data yet</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Volume Mini-Chart */}
                <div className="chart-panel chart-panel--narrow">
                    <div className="chart-header">
                        <div className="chart-title">REQUEST VOLUME</div>
                        <div className="chart-range">7 days</div>
                    </div>
                    <div className="chart-body">
                        {loading ? (
                            <div className="chart-empty">
                                <Loader2 className="chart-loader" />
                            </div>
                        ) : latencySeries.length > 0 ? (
                            <ResponsiveContainer width="100%" height={220}>
                                <AreaChart data={latencySeries} margin={{ top: 10, right: 4, left: -28, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="volumeGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.35} />
                                            <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid stroke="rgba(167,139,250,0.06)" strokeDasharray="4 6" vertical={false} />
                                    <XAxis
                                        dataKey="bucket"
                                        tickFormatter={formatDate}
                                        stroke="rgba(167,139,250,0.15)"
                                        tick={{ fill: 'rgba(167,139,250,0.5)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                                        minTickGap={48}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        stroke="rgba(167,139,250,0.15)"
                                        tick={{ fill: 'rgba(167,139,250,0.5)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip
                                        content={<MissionTooltip valueFormatter={(v) => `${v} req`} />}
                                        cursor={{ stroke: 'rgba(167,139,250,0.2)', strokeWidth: 1, strokeDasharray: '4 4' }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="request_count"
                                        name="Requests"
                                        stroke="#a78bfa"
                                        strokeWidth={1.5}
                                        fillOpacity={1}
                                        fill="url(#volumeGrad)"
                                        isAnimationActive={true}
                                        animationDuration={1400}
                                        animationEasing="ease-out"
                                        activeDot={{ r: 4, strokeWidth: 0, fill: '#a78bfa', filter: 'drop-shadow(0 0 8px rgba(167,139,250,0.8))' }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="chart-empty">
                                <Activity className="chart-empty-icon" />
                                <span>No volume data yet</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Recent Traces ── */}
            <div className="traces-panel">
                <div className="traces-header">
                    <div className="chart-title">RECENT TRACES</div>
                    <Link href="/audit">
                        <Button variant="ghost" size="sm" className="traces-view-all">
                            View all <ArrowUpRight className="h-3 w-3" />
                        </Button>
                    </Link>
                </div>
                <div className="traces-body">
                    {loading ? (
                        <>
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="trace-row trace-row--skeleton">
                                    <div className="trace-dot-skeleton" />
                                    <div className="trace-path-skeleton" />
                                    <div className="trace-meta-skeleton" />
                                </div>
                            ))}
                        </>
                    ) : recentLogs.length === 0 ? (
                        <div className="traces-empty">
                            <Activity className="traces-empty-icon" />
                            <p>No activity yet. Send a request to see it here.</p>
                        </div>
                    ) : (
                        recentLogs.map((log, idx) => (
                            <div key={log.id} className="trace-row" style={{ animationDelay: `${idx * 40}ms` }}>
                                <StatusDot status={log.upstream_status} result={log.policy_result} />

                                {/* Desktop layout */}
                                <div className="trace-content">
                                    <div className="trace-method-path">
                                        <span className="trace-method">{log.method}</span>
                                        <span className="trace-path">{log.path}</span>
                                    </div>
                                    <div className="trace-agent">{log.agent_name || "—"}</div>
                                    <div className="trace-metrics">
                                        <span className="trace-latency">{log.response_latency_ms}ms</span>
                                        {log.estimated_cost_usd && parseFloat(log.estimated_cost_usd) > 0 && (
                                            <span className="trace-cost">${parseFloat(log.estimated_cost_usd).toFixed(5)}</span>
                                        )}
                                    </div>
                                    <div className="trace-time">
                                        {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </div>
                                </div>

                                {/* Mobile layout */}
                                <div className="trace-mobile">
                                    <div className="trace-mobile-row">
                                        <span className="trace-method">{log.method}</span>
                                        <span className="trace-path">{log.path}</span>
                                    </div>
                                    <div className="trace-mobile-row trace-mobile-row--sub">
                                        <span className="trace-agent">{log.agent_name || "—"}</span>
                                        <span className="trace-latency">{log.response_latency_ms}ms</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Horizon Bar ──────────────────────────────────────────────────────────────
function HorizonBar({ state, loading }: { state: "nominal" | "degraded" | "critical"; loading: boolean }) {
    return (
        <div className={cn("horizon-bar", `horizon-bar--${state}`, loading && "horizon-bar--loading")}>
            <div className="horizon-fill" />
            <div className="horizon-glow" />
        </div>
    );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
    label, value, sub, prefix, suffix, decimals = 0,
    loading, trend, delay = 0, icon, accent = "cyan"
}: {
    label: string; value: number; sub: string; prefix?: string; suffix?: string;
    decimals?: number; loading?: boolean; trend?: "up" | "down";
    delay?: number; icon: React.ReactNode; accent?: "cyan" | "emerald" | "amber";
}) {
    return (
        <div className={cn("kpi-card", `kpi-card--${accent}`)} style={{ animationDelay: `${delay * 80}ms` }}>
            <div className="kpi-card-inner">
                <div className="kpi-top">
                    <span className="kpi-label">{label}</span>
                    <div className={cn("kpi-icon", `kpi-icon--${accent}`)}>
                        {icon}
                    </div>
                </div>
                <div className="kpi-value-row">
                    {loading ? (
                        <div className="kpi-skeleton" />
                    ) : (
                        <>
                            <div className="kpi-value">
                                <CountUp value={value} duration={1000} decimals={decimals} prefix={prefix} suffix={suffix} />
                            </div>
                            {trend && (
                                <span className={cn("kpi-trend", trend === "up" ? "kpi-trend--up" : "kpi-trend--down")}>
                                    {trend === "up" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                </span>
                            )}
                        </>
                    )}
                </div>
                <p className="kpi-sub">{sub}</p>
            </div>
            <div className="kpi-corner-light" />
            <div className="kpi-border-accent" />
        </div>
    );
}

// ── Status Dot ───────────────────────────────────────────────────────────────
function StatusDot({ status, result }: { status: number | null; result: string }) {
    if (result === "blocked") {
        return <div className="trace-status trace-status--blocked" />;
    }
    if (result === "shadow_violation") {
        return <div className="trace-status trace-status--shadow" />;
    }
    if (status && status >= 200 && status < 400) {
        return <div className="trace-status trace-status--ok" />;
    }
    return <div className="trace-status trace-status--unknown" />;
}
