"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { getUpstreamHealth, UpstreamStatus, swrFetcher } from "@/lib/api";
import { Activity, AlertTriangle, CheckCircle2, Server, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { PageSkeleton } from "@/components/page-skeleton";
import { Badge } from "@/components/ui/badge";

const EMPTY_UPSTREAMS: UpstreamStatus[] = [];

export default function UpstreamsPage() {
    const { data: upstreamsData, isLoading } = useSWR<UpstreamStatus[]>("/health/upstreams", swrFetcher, {
        refreshInterval: 5000
    });
    const upstreams = upstreamsData || EMPTY_UPSTREAMS;

    const healthyCount = upstreams.filter((u) => u.is_healthy).length;
    const unhealthyCount = upstreams.filter((u) => !u.is_healthy).length;

    return (
        <div className="p-8 space-y-6 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="space-y-1 animate-fade-in">
                <h2 className="text-3xl font-bold tracking-tight">Upstream Status</h2>
                <p className="text-muted-foreground text-sm">
                    Real-time health monitoring of upstream LLM providers (OpenAI, Anthropic, etc.)
                </p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-slide-up">
                <StatCard
                    icon={Server}
                    label="Total Upstreams"
                    value={upstreams.length}
                    color="blue"
                    loading={isLoading}
                />
                <StatCard
                    icon={CheckCircle2}
                    label="Healthy"
                    value={healthyCount}
                    color="emerald"
                    loading={isLoading}
                />
                <StatCard
                    icon={AlertTriangle}
                    label="Circuit Open"
                    value={unhealthyCount}
                    color="rose"
                    loading={isLoading}
                />
            </div>

            {/* Loading / Error / Empty / Table */}
            <div className="animate-slide-up stagger-2">
                {isLoading && upstreams.length === 0 ? (
                    <PageSkeleton cards={0} rows={5} />
                ) : upstreams.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 bg-card/30 p-12 text-center">
                        <div className="mx-auto h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                            <Server className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-semibold">No upstreams tracked</h3>
                        <p className="text-muted-foreground max-w-sm mx-auto mt-1">
                            Send requests through agent tokens with configured upstreams to see status here.
                        </p>
                    </div>
                ) : (
                    <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden shadow-sm">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border/60 text-left text-muted-foreground bg-muted/20">
                                    <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider">URL</th>
                                    <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider">Token</th>
                                    <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider text-right">Failures</th>
                                    <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider text-right">Cooldown</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                                {upstreams.map((u, i) => (
                                    <tr key={`${u.token_id}-${u.url}-${i}`} className="hover:bg-muted/30 transition-colors group">
                                        <td className="px-6 py-4">
                                            {u.is_healthy ? (
                                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1.5 pl-1.5 pr-2.5">
                                                    <span className="relative flex h-2 w-2">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                                    </span>
                                                    Healthy
                                                </Badge>
                                            ) : (
                                                <Badge variant="destructive" className="gap-1.5">
                                                    <AlertTriangle className="h-3 w-3" />
                                                    Circuit Open
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs truncate max-w-[300px]" title={u.url}>
                                            <div className="flex items-center gap-2">
                                                <Zap className="h-3 w-3 text-muted-foreground group-hover:text-yellow-400 transition-colors" />
                                                {u.url}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs text-muted-foreground max-w-[180px]">
                                            <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] tracking-wide">
                                                {u.token_id.slice(0, 8)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {u.failure_count > 0 ? (
                                                <span className="text-amber-500 font-bold tabular-nums">{u.failure_count}</span>
                                            ) : (
                                                <span className="text-muted-foreground/30 tabular-nums">0</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {u.cooldown_remaining_secs != null && u.cooldown_remaining_secs > 0 ? (
                                                <span className="text-amber-400 font-mono text-xs bg-amber-500/10 px-1.5 py-0.5 rounded">
                                                    {u.cooldown_remaining_secs}s
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground/30">—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

function StatCard({ icon: Icon, label, value, color, loading }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: number;
    color: "blue" | "emerald" | "rose";
    loading?: boolean;
}) {
    const bgColors = {
        blue: "bg-blue-500/10 text-blue-500",
        emerald: "bg-emerald-500/10 text-emerald-500",
        rose: "bg-rose-500/10 text-rose-500",
    };
    return (
        <Card className="glass-card hover-lift">
            <CardContent className="p-5 flex items-center gap-4">
                <div className={cn("p-3 rounded-xl transition-colors", bgColors[color])}>
                    <Icon className="h-6 w-6" />
                </div>
                <div>
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
                    {loading ? (
                        <div className="h-8 w-16 bg-muted/50 rounded shimmer my-0.5" />
                    ) : (
                        <p className="text-3xl font-bold tabular-nums tracking-tight">{value}</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
