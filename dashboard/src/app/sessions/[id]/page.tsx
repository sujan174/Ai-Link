"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSession, SessionSummary } from "@/lib/api";
import {
    ArrowLeft,
    DollarSign,
    Zap,
    Clock,
    Activity,
    Cpu,
    ChevronRight,
    Bot,
    Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, formatDistanceToNow } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";
import { CHART_AXIS_PROPS } from "@/components/ui/chart-utils";

const MODEL_COLORS = [
    "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
    "#06b6d4", "#ec4899", "#84cc16",
];

function getModelColor(model: string | null, modelMap: Map<string, string>): string {
    if (!model) return "#94a3b8";
    if (modelMap.has(model)) return modelMap.get(model)!;
    const idx = modelMap.size % MODEL_COLORS.length;
    modelMap.set(model, MODEL_COLORS[idx]);
    return MODEL_COLORS[idx];
}

function StatCard({ icon: Icon, label, value, sub, color }: {
    icon: React.ElementType; label: string; value: string; sub?: string; color: string;
}) {
    return (
        <Card className="border-border/60 bg-card/50">
            <CardContent className="p-5 flex items-center gap-4">
                <div className={cn("p-2.5 rounded-md", color)}>
                    <Icon className="h-5 w-5" />
                </div>
                <div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-lg font-bold mt-0.5">{value}</p>
                    {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
                </div>
            </CardContent>
        </Card>
    );
}

export default function SessionDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = decodeURIComponent(params.id as string);

    const [session, setSession] = useState<SessionSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!id) return;
        getSession(id)
            .then(setSession)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
        );
    }

    if (!session) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
                <Layers className="h-10 w-10 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Session not found</h2>
                <Button onClick={() => router.back()}>Go Back</Button>
            </div>
        );
    }

    const totalCost = parseFloat(session.total_cost_usd ?? "0");
    const totalTokens = session.total_prompt_tokens + session.total_completion_tokens;
    const durationSec = session.total_latency_ms / 1000;

    // Build model color map
    const modelColorMap = new Map<string, string>();
    (session.models_used ?? []).forEach((m, i) => modelColorMap.set(m, MODEL_COLORS[i % MODEL_COLORS.length]));

    // Build Gantt Chart data
    const firstReqTime = new Date(session.first_request_at).getTime();

    // Sort array by time to ensure a proper visual waterfall flow
    const sortedRequests = [...session.requests].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const chartData = sortedRequests.map((r, i) => {
        const reqStart = new Date(r.created_at).getTime();
        const offsetMs = Math.max(0, reqStart - firstReqTime);
        const durationMs = r.response_latency_ms ?? 0;

        return {
            name: `#${i + 1}`,
            offsetMs,
            durationMs,
            model: r.model ?? "unknown",
            id: r.id,
            originalIndex: session.requests.findIndex(sr => sr.id === r.id) + 1,
        };
    });

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-20">
            {/* Nav */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-2">
                    <ArrowLeft className="h-4 w-4" /> Back to Sessions
                </Button>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-[13px] text-muted-foreground break-all">{session.session_id}</span>
                </div>
            </div>

            {/* Time Range */}
            <div className="rounded-md border border-border/60 bg-card/50 px-6 py-4 flex flex-wrap items-center gap-4 text-sm">
                <div>
                    <span className="text-muted-foreground">Started: </span>
                    <span className="font-medium">{format(new Date(session.first_request_at), "MMM d, yyyy HH:mm:ss")}</span>
                </div>
                <div className="h-4 w-px bg-border hidden md:block" />
                <div>
                    <span className="text-muted-foreground">Ended: </span>
                    <span className="font-medium">{format(new Date(session.last_request_at), "HH:mm:ss")}</span>
                </div>
                <div className="h-4 w-px bg-border hidden md:block" />
                <div>
                    <span className="text-muted-foreground">{formatDistanceToNow(new Date(session.last_request_at), { addSuffix: true })}</span>
                </div>
                {(session.models_used ?? []).length > 0 && (
                    <div className="flex items-center gap-1 ml-auto">
                        {(session.models_used ?? []).map((m, i) => (
                            <Badge
                                key={m}
                                variant="secondary"
                                className="text-xs font-mono"
                                style={{ borderColor: MODEL_COLORS[i % MODEL_COLORS.length], color: MODEL_COLORS[i % MODEL_COLORS.length] }}
                            >
                                {m.includes("/") ? m.split("/").pop() : m}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon={DollarSign} label="Total Cost" value={`$${totalCost.toFixed(6)}`} color="bg-emerald-500/10 text-emerald-500" />
                <StatCard icon={Zap} label="Total Requests" value={session.total_requests.toString()} color="bg-primary/10 text-primary" />
                <StatCard icon={Cpu} label="Total Tokens" value={totalTokens.toLocaleString()} sub={`↑${session.total_prompt_tokens.toLocaleString()} ↓${session.total_completion_tokens.toLocaleString()}`} color="bg-violet-500/10 text-violet-500" />
                <StatCard icon={Clock} label="Wall-clock" value={`${durationSec.toFixed(1)}s`} color="bg-amber-500/10 text-amber-500" />
            </div>

            {/* Agent Session Gantt Chart */}
            {chartData.length > 0 && (
                <Card className="border-border/60 bg-card/50">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Agent Session Timeline</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 40 + 60)}>
                            <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 20, bottom: 0, left: -20 }}>
                                <CartesianGrid stroke="#1F2233" strokeDasharray="3 3" vertical={false} />
                                <XAxis type="number" tickFormatter={(v) => `${v}ms`} {...CHART_AXIS_PROPS} />
                                <YAxis type="category" dataKey="name" {...CHART_AXIS_PROPS} width={50} />
                                <Tooltip
                                    cursor={{ fill: 'var(--border)', opacity: 0.1 }}
                                    content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null;
                                        const d = payload[0].payload;
                                        return (
                                            <div className="rounded-md border border-border/50 bg-background/95 p-3 text-sm shadow-xl backdrop-blur-sm z-[100]">
                                                <p className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-2">{d.name} ({d.model})</p>
                                                <p className="font-medium text-emerald-400">{d.durationMs}ms duration</p>
                                                <p className="text-xs text-muted-foreground mt-1">Started at +{d.offsetMs}ms</p>
                                            </div>
                                        );
                                    }}
                                />
                                {/* Transparent base bar to push the colored block to the correct timestamp offset */}
                                <Bar dataKey="offsetMs" stackId="timeline" fill="transparent" />
                                {/* Colored duration block representing execution latency */}
                                <Bar dataKey="durationMs" stackId="timeline" radius={[4, 4, 4, 4]}>
                                    {chartData.map((d) => (
                                        <Cell key={d.id} fill={getModelColor(d.model, modelColorMap)} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>

                        {/* Model legend */}
                        <div className="flex flex-wrap gap-3 mt-3">
                            {Array.from(modelColorMap.entries()).map(([model, color]) => (
                                <div key={model} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <div className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
                                    <span className="font-mono">{model.includes("/") ? model.split("/").pop() : model}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Request Timeline Table */}
            <Card className="border-border/60 bg-card/50">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Request Timeline</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border/60 bg-muted/20">
                                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">#</th>
                                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Model</th>
                                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Cost</th>
                                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Latency</th>
                                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Tokens</th>
                                    <th className="text-right px-4 py-2 font-medium text-muted-foreground hidden md:table-cell">Tools</th>
                                    <th className="text-center px-4 py-2 font-medium text-muted-foreground hidden md:table-cell">Cache</th>
                                    <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden lg:table-cell">Properties</th>
                                    <th className="px-4 py-2 w-8" />
                                </tr>
                            </thead>
                            <tbody>
                                {session.requests.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground text-sm">
                                            <Bot className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                            No request data available
                                        </td>
                                    </tr>
                                ) : session.requests.map((r, i) => {
                                    const reqCost = parseFloat(r.estimated_cost_usd ?? "0");
                                    const tokens = (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0);
                                    const latencyMs = r.response_latency_ms ?? 0;
                                    const color = getModelColor(r.model, modelColorMap);
                                    const props = r.custom_properties;

                                    return (
                                        <tr
                                            key={r.id}
                                            onClick={() => router.push(`/audit/${r.id}`)}
                                            className="border-b border-border/40 hover:bg-muted/20 cursor-pointer transition-colors group"
                                        >
                                            <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                                                {i + 1}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                {r.model ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="h-2 w-2 rounded-sm flex-shrink-0" style={{ background: color }} />
                                                        <span className="font-mono text-xs">
                                                            {r.model.includes("/") ? r.model.split("/").pop() : r.model}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-500 text-xs">
                                                ${reqCost.toFixed(6)}
                                            </td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground text-xs">
                                                {latencyMs >= 1000 ? `${(latencyMs / 1000).toFixed(1)}s` : `${latencyMs}ms`}
                                            </td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground text-xs">
                                                {tokens > 0 ? tokens.toLocaleString() : "—"}
                                            </td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground text-xs hidden md:table-cell">
                                                {r.tool_call_count ?? "—"}
                                            </td>
                                            <td className="px-4 py-2.5 text-center hidden md:table-cell">
                                                {r.cache_hit != null && (
                                                    <Badge variant={r.cache_hit ? "default" : "outline"} className="text-xs px-1.5 py-0">
                                                        {r.cache_hit ? "HIT" : "MISS"}
                                                    </Badge>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5 hidden lg:table-cell">
                                                {props && Object.keys(props).length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {Object.entries(props).slice(0, 3).map(([k, v]) => (
                                                            <span
                                                                key={k}
                                                                className="inline-flex items-center gap-1 text-xs bg-muted/60 px-1.5 py-0.5 rounded font-mono"
                                                            >
                                                                <span className="text-muted-foreground">{k}:</span>
                                                                <span>{String(v)}</span>
                                                            </span>
                                                        ))}
                                                        {Object.keys(props).length > 3 && (
                                                            <span className="text-xs text-muted-foreground">+{Object.keys(props).length - 3}</span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
