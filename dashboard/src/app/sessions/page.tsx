"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { listSessions, getSessionEntity, SessionSummary, SessionEntity } from "@/lib/api";
import {
    Layers,
    DollarSign,
    Zap,
    Activity,
    Clock,
    ChevronRight,
    Search,
    Bot,
    RefreshCw,
    PauseCircle,
    CheckCircle2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

type SessionStatus = "active" | "paused" | "completed" | undefined;

function StatusBadge({ status }: { status: SessionStatus }) {
    if (!status) return <span className="text-muted-foreground text-xs">—</span>;
    const cfg = {
        active: { variant: "success" as const, dot: true, label: "Active" },
        paused: { variant: "warning" as const, dot: true, label: "Paused" },
        completed: { variant: "secondary" as const, dot: false, label: "Done" },
    };
    const c = cfg[status] ?? cfg.completed;
    return <Badge variant={c.variant} dot={c.dot} className="text-[10px] capitalize">{c.label}</Badge>;
}

function StatCard({ icon: Icon, label, value, color }: {
    icon: React.ElementType; label: string; value: string; color: string
}) {
    return (
        <div className="rounded-md border border-border/60 bg-card/50 p-5 flex items-center gap-4">
            <div className={cn("p-2.5 rounded-md", color)}>
                <Icon className="h-5 w-5" />
            </div>
            <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-bold mt-0.5">{value}</p>
            </div>
        </div>
    );
}

function ModelBadges({ models }: { models: string[] | null }) {
    if (!models?.length) return <span className="text-muted-foreground text-xs">—</span>;
    const first = models[0];
    const rest = models.length - 1;
    const shortName = first.includes("/") ? first.split("/").pop()! : first;
    const display = shortName.length > 16 ? shortName.slice(0, 14) + "…" : shortName;
    return (
        <div className="flex items-center gap-1">
            <Badge variant="secondary" className="text-xs font-mono px-1.5 py-0">{display}</Badge>
            {rest > 0 && <span className="text-xs text-muted-foreground">+{rest}</span>}
        </div>
    );
}

type StatusFilter = "all" | "active" | "paused" | "completed";

export default function SessionsPage() {
    const router = useRouter();
    const [sessions, setSessions] = useState<SessionSummary[]>([]);
    const [entities, setEntities] = useState<Record<string, SessionEntity>>({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        try {
            const data = await listSessions(200);
            setSessions(data);
            // Fetch entity data for each session (status, spend cap) in parallel
            const entityResults = await Promise.allSettled(
                data.map(s => s.session_id ? getSessionEntity(s.session_id) : Promise.reject())
            );
            const entityMap: Record<string, SessionEntity> = {};
            entityResults.forEach((r, i) => {
                if (r.status === "fulfilled" && data[i].session_id) {
                    entityMap[data[i].session_id!] = r.value;
                }
            });
            setEntities(entityMap);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = sessions.filter(s => {
        const sid = s.session_id ?? "";
        const matchSearch = !search || sid.toLowerCase().includes(search.toLowerCase());
        if (!matchSearch) return false;
        if (statusFilter === "all") return true;
        const entity = entities[sid];
        return entity?.status === statusFilter;
    });

    // Aggregate stats
    const totalCost = sessions.reduce((sum, s) => sum + parseFloat(s.total_cost_usd ?? "0"), 0);
    const avgCost = sessions.length > 0 ? totalCost / sessions.length : 0;
    const avgRequests = sessions.length > 0
        ? sessions.reduce((sum, s) => sum + s.total_requests, 0) / sessions.length
        : 0;
    const activeCount = Object.values(entities).filter(e => e.status === "active").length;
    const pausedCount = Object.values(entities).filter(e => e.status === "paused").length;

    const STATUS_TABS: { key: StatusFilter; label: string; icon?: React.ElementType }[] = [
        { key: "all", label: "All" },
        { key: "active", label: `Active (${activeCount})`, icon: Activity },
        { key: "paused", label: `Paused (${pausedCount})`, icon: PauseCircle },
        { key: "completed", label: "Completed", icon: CheckCircle2 },
    ];

    return (
        <div className="p-4 space-y-6 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Layers className="h-5 w-5 text-primary" />
                        <h1 className="text-xl font-semibold">Sessions</h1>
                    </div>
                    <p className="text-[13px] text-muted-foreground">
                        Agent run lifecycle — track cost, pause, resume, and cap spending per session
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}>
                    <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", refreshing && "animate-spin")} />
                    Refresh
                </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon={Layers} label="Total Sessions" value={sessions.length.toLocaleString()} color="bg-primary/10 text-primary" />
                <StatCard icon={DollarSign} label="Total Cost" value={`$${totalCost.toFixed(4)}`} color="bg-emerald-500/10 text-emerald-500" />
                <StatCard icon={Activity} label="Avg Cost / Session" value={`$${avgCost.toFixed(4)}`} color="bg-amber-500/10 text-amber-500" />
                <StatCard icon={Zap} label="Avg Requests" value={avgRequests.toFixed(1)} color="bg-violet-500/10 text-violet-500" />
            </div>

            {/* Search + Status Filter */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="relative max-w-sm w-full sm:w-auto">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Filter by session ID…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9 h-9"
                    />
                </div>
                {/* Status Tabs */}
                <div className="flex items-center gap-1 border rounded-md p-0.5 bg-muted/20">
                    {STATUS_TABS.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setStatusFilter(tab.key)}
                            className={cn(
                                "px-3 py-1 rounded text-xs font-medium transition-all flex items-center gap-1",
                                statusFilter === tab.key
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {tab.icon && <tab.icon className="h-3 w-3" />}
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="rounded-md border border-border/60 bg-card/50 overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border/60 bg-muted/30">
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Session ID</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                            <th className="text-right px-4 py-3 font-medium text-muted-foreground">Requests</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Models</th>
                            <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total Cost</th>
                            <th className="text-right px-4 py-3 font-medium text-muted-foreground">Spend Cap</th>
                            <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Latency</th>
                            <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Last Active</th>
                            <th className="px-4 py-3 w-8" />
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            Array.from({ length: 8 }).map((_, i) => (
                                <tr key={i} className="border-b border-border/40">
                                    {Array.from({ length: 8 }).map((_, j) => (
                                        <td key={j} className="px-4 py-3">
                                            <div className="h-4 bg-muted/60 rounded animate-pulse w-20" />
                                        </td>
                                    ))}
                                    <td />
                                </tr>
                            ))
                        ) : filtered.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="px-4 py-16 text-center">
                                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                                        <Bot className="h-10 w-10 opacity-30" />
                                        <p className="text-sm">
                                            {search ? "No sessions match your filter" : "No sessions yet — start tracing your agent calls with X-Session-Id"}
                                        </p>
                                    </div>
                                </td>
                            </tr>
                        ) : filtered.map((s) => {
                            const sid = s.session_id ?? "unknown";
                            const totalTokens = s.total_prompt_tokens + s.total_completion_tokens;
                            const latencySec = (s.total_latency_ms / 1000).toFixed(1);
                            const cost = parseFloat(s.total_cost_usd ?? "0").toFixed(4);
                            const entity = entities[sid];
                            const spendCap = entity?.spend_cap_usd
                                ? `$${parseFloat(entity.spend_cap_usd).toFixed(2)}`
                                : "—";
                            return (
                                <tr
                                    key={sid}
                                    onClick={() => router.push(`/sessions/${encodeURIComponent(sid)}`)}
                                    className="border-b border-border/40 hover:bg-muted/20 cursor-pointer transition-colors group"
                                >
                                    <td className="px-4 py-3">
                                        <span className="font-mono text-xs text-primary group-hover:underline">
                                            {sid.length > 28 ? sid.slice(0, 26) + "…" : sid}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge status={entity?.status} />
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums">{s.total_requests}</td>
                                    <td className="px-4 py-3"><ModelBadges models={s.models_used} /></td>
                                    <td className="px-4 py-3 text-right tabular-nums font-mono text-emerald-500">${cost}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">{spendCap}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                                        <div className="flex items-center justify-end gap-1">
                                            <Clock className="h-3 w-3 opacity-50" />
                                            {latencySec}s
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right text-muted-foreground hidden lg:table-cell text-xs">
                                        {formatDistanceToNow(new Date(s.last_request_at), { addSuffix: true })}
                                    </td>
                                    <td className="px-4 py-3">
                                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {!loading && filtered.length > 0 && (
                    <div className="px-4 py-2 border-t border-border/40 bg-muted/10 text-xs text-muted-foreground text-right">
                        {filtered.length} session{filtered.length !== 1 ? "s" : ""}
                    </div>
                )}
            </div>
        </div>
    );
}
