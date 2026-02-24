"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import useSWR, { mutate } from "swr"
import { swrFetcher, listTokens, streamAuditLogs, AuditLog, Token } from "@/lib/api"
import { cn } from "@/lib/utils"
import { DataTable } from "@/components/data-table"
import { columns } from "./columns"
import {
    Activity,
    Clock,
    DollarSign,
    Cpu,
    Search,
    Filter,
    X,
    Loader2,
    Play,
    Pause,
    RefreshCw
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/empty-state"
import { PageSkeleton } from "@/components/page-skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

// ── Summary Card ────────────────────────────────

function StatCard({
    icon: Icon,
    label,
    value,
    sub,
    color,
    loading
}: {
    icon: React.ElementType
    label: string
    value: string
    sub?: string
    color: string
    loading?: boolean
}) {
    return (
        <Card className="glass-card hover-lift">
            <CardContent className="p-4 flex items-center gap-4">
                <div className={cn("p-2.5 rounded-xl transition-colors", color)}>
                    <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
                    {loading ? (
                        <div className="h-7 w-24 bg-muted/50 rounded shimmer my-0.5" />
                    ) : (
                        <p className="text-xl font-bold tabular-nums tracking-tight">{value}</p>
                    )}
                    {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
                </div>
            </CardContent>
        </Card>
    )
}

// ── Page ──────────────────────────────────────────

const EMPTY_LOGS: AuditLog[] = [];
const EMPTY_TOKENS: Token[] = [];

export default function AuditPage() {
    const router = useRouter()
    const [isLive, setIsLive] = useState(false)
    const [selectedToken, setSelectedToken] = useState<string>("all")
    const [liveLogs, setLiveLogs] = useState<AuditLog[]>([])

    // Data Fetching
    const { data: tokensData } = useSWR<Token[]>("/tokens", swrFetcher)
    const tokens = tokensData || EMPTY_TOKENS;

    // Construct Query Key
    const queryKey = selectedToken && selectedToken !== "all"
        ? `/audit?limit=500&token_id=${selectedToken}`
        : `/audit?limit=500`;

    const { data: historicalLogsData, isLoading, mutate: refreshLogs } = useSWR<AuditLog[]>(
        !isLive ? queryKey : null, // Pause SWR when live
        swrFetcher,
        {
            keepPreviousData: true,
            revalidateOnFocus: false
        }
    )
    const historicalLogs = historicalLogsData || EMPTY_LOGS;

    // Combined Logs
    const logs = isLive ? liveLogs : historicalLogs;

    // Live Stream Effect
    useEffect(() => {
        if (!isLive) return;

        // Reset to historical data when starting live mode to avoid empty flash
        setLiveLogs(historicalLogs.slice(0, 50));

        const cleanup = streamAuditLogs((log) => {
            // Check filter
            if (selectedToken !== "all" && log.token_id !== selectedToken) return;

            setLiveLogs(prev => {
                const newLogs = [log, ...prev];
                return newLogs.slice(0, 500); // Keep buffer capped
            });
        });
        return cleanup;
    }, [isLive, selectedToken, historicalLogs]);

    const handleRowClick = useCallback((log: AuditLog) => {
        router.push(`/audit/${log.id}`)
    }, [router])

    // Summary stats
    const nonHitlLogs = logs.filter(l => !["approved", "rejected", "timeout"].includes(l.policy_result))
    const avgLatency = nonHitlLogs.length > 0
        ? Math.round(nonHitlLogs.reduce((s, l) => s + l.response_latency_ms, 0) / nonHitlLogs.length)
        : 0
    const totalCost = logs.reduce((s, l) => s + (l.estimated_cost_usd ? parseFloat(l.estimated_cost_usd) : 0), 0)
    const totalTokens = logs.reduce((s, l) => s + (l.prompt_tokens ?? 0) + (l.completion_tokens ?? 0), 0)

    const handleFilterChange = (val: string) => {
        setSelectedToken(val)
        // If live, we need to clear live buffer if distinct, or just let filter logic handle it
        if (isLive) setLiveLogs([]);
    }

    return (
        <div className="p-8 space-y-6 max-w-[1600px] mx-auto">
            {/* Controls */}
            <div className="flex items-center justify-end animate-fade-in mb-2">
                {/* Controls */}
                <div className="flex items-center gap-3">
                    {isLive && (
                        <Badge variant="outline" className="animate-pulse text-emerald-500 border-emerald-500/50 bg-emerald-500/10 mr-2">
                            LIVE
                        </Badge>
                    )}
                    {/* Live Toggle */}
                    <Button
                        variant={isLive ? "destructive" : "outline"}
                        size="sm"
                        onClick={() => setIsLive(!isLive)}
                        className={cn("gap-2 min-w-[100px] transition-all")}
                    >
                        {isLive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        {isLive ? "Pause" : "Live View"}
                    </Button>

                    <div className="h-6 w-px bg-border/60" />

                    {/* Filter */}
                    <div className="flex items-center gap-2">
                        <div className="relative w-[240px]">
                            <Select
                                value={selectedToken}
                                onValueChange={(val) => handleFilterChange(val)}
                            >
                                <SelectTrigger className="pl-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Tokens</SelectItem>
                                    {tokens.map(t => (
                                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Filter className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        </div>
                        {selectedToken !== "all" && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => handleFilterChange("all")}
                                title="Clear filter"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                    </div>

                    <div className="h-6 w-px bg-border/60" />

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refreshLogs()}
                        disabled={isLoading || isLive}
                        className="gap-2"
                    >
                        <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-slide-up">
                <StatCard
                    icon={Activity}
                    label="Visible Requests"
                    value={logs.length.toLocaleString()}
                    color="bg-blue-500/10 text-blue-500"
                    loading={isLoading && !isLive}
                />
                <StatCard
                    icon={Clock}
                    label="Avg Latency"
                    value={`${avgLatency}ms`}
                    color="bg-emerald-500/10 text-emerald-500"
                    loading={isLoading && !isLive}
                />
                <StatCard
                    icon={DollarSign}
                    label="Total Cost"
                    value={`$${totalCost.toFixed(4)}`}
                    color="bg-amber-500/10 text-amber-500"
                    loading={isLoading && !isLive}
                />
                <StatCard
                    icon={Cpu}
                    label="Tokens Processed"
                    value={totalTokens.toLocaleString()}
                    color="bg-violet-500/10 text-violet-500"
                    loading={isLoading && !isLive}
                />
            </div>

            {/* Table */}
            <div className="animate-slide-up stagger-2">
                {isLoading && !isLive && logs.length === 0 ? (
                    <PageSkeleton cards={0} rows={10} />
                ) : logs.length === 0 ? (
                    <EmptyState
                        icon={Search}
                        title="No traces found"
                        description={selectedToken !== "all" ? "No logs match the current filter." : "Send your first request to the gateway to see it here."}
                        actionLabel={selectedToken !== "all" ? "Clear Filter" : undefined}
                        onAction={selectedToken !== "all" ? () => handleFilterChange("all") : undefined}
                    />
                ) : (
                    <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden shadow-sm">
                        <DataTable
                            columns={columns}
                            data={logs}
                            onRowClick={handleRowClick}
                            searchKey="path"
                            searchPlaceholder="Filter by path..."
                        />
                    </div>
                )}
            </div>
        </div>
    )
}
