"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { listAuditLogs, listTokens, streamAuditLogs, AuditLog, Token } from "@/lib/api"
import { cn } from "@/lib/utils"
import { DataTable } from "@/components/data-table"
import { columns } from "./columns"
import {
    Activity,
    Clock,
    DollarSign,
    Cpu,
    Search,
    ChevronLeft,
    ChevronRight,
    Filter,
    X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/empty-state"
import { PageSkeleton } from "@/components/page-skeleton"
import { Select } from "@/components/ui/select"

// ── Summary Card ────────────────────────────────

function StatCard({
    icon: Icon,
    label,
    value,
    sub,
    color,
}: {
    icon: React.ElementType
    label: string
    value: string
    sub?: string
    color: string
}) {
    return (
        <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm p-4 flex items-center gap-3 min-w-0">
            <div className={`rounded-lg p-2 ${color}`}>
                <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold truncate">{value}</p>
                {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
            </div>
        </div>
    )
}

// ── Page ──────────────────────────────────────────

const PAGE_SIZE = 50;

export default function AuditPage() {
    const router = useRouter()

    // Data state
    const [logs, setLogs] = useState<AuditLog[]>([])
    const [tokens, setTokens] = useState<Token[]>([])
    const [loading, setLoading] = useState(true)
    const [isLive, setIsLive] = useState(false)

    // Filter state
    const [page, setPage] = useState(0)
    const [selectedToken, setSelectedToken] = useState<string>("all")

    // Fetch Tokens on mount
    useEffect(() => {
        listTokens().then(setTokens).catch(console.error)
    }, [])

    // Fetch Logs when filters change
    useEffect(() => {
        if (isLive) return // Skip fetch if live
        setLoading(true)
        const filters = selectedToken !== "all" ? { token_id: selectedToken } : undefined

        listAuditLogs(PAGE_SIZE, page * PAGE_SIZE, filters)
            .then(setLogs)
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [page, selectedToken, isLive])

    // Live Stream Effect
    useEffect(() => {
        if (!isLive) return;

        // Reset filters when going live
        if (selectedToken !== "all") setSelectedToken("all");

        const cleanup = streamAuditLogs((log) => {
            setLogs(prev => {
                const newLogs = [log, ...prev];
                return newLogs.slice(0, PAGE_SIZE);
            });
        });
        return cleanup;
    }, [isLive]);

    const handleRowClick = useCallback((log: AuditLog) => {
        router.push(`/audit/${log.id}`)
    }, [router])

    // Summary stats — exclude HITL requests from latency
    const totalRequests = logs.length // This is just for current page/view
    const nonHitlLogs = logs.filter(l => !["approved", "rejected", "timeout"].includes(l.policy_result))
    const avgLatency = nonHitlLogs.length > 0
        ? Math.round(nonHitlLogs.reduce((s, l) => s + l.response_latency_ms, 0) / nonHitlLogs.length)
        : 0
    const totalCost = logs.reduce((s, l) => s + (l.estimated_cost_usd ? parseFloat(l.estimated_cost_usd) : 0), 0)
    const totalTokens = logs.reduce((s, l) => s + (l.prompt_tokens ?? 0) + (l.completion_tokens ?? 0), 0)

    const handleFilterChange = (val: string) => {
        setSelectedToken(val)
        setPage(0) // Reset to first page
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Traffic Inspector</h1>
                    <p className="text-muted-foreground text-sm">
                        Real-time request log with AI golden signals.
                    </p>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2">
                    <Button
                        variant={isLive ? "default" : "outline"}
                        size="sm"
                        onClick={() => setIsLive(!isLive)}
                        className={cn("gap-2 transition-all", isLive && "bg-red-500 hover:bg-red-600 text-white border-red-500")}
                    >
                        <Activity className={cn("h-4 w-4", isLive && "animate-pulse")} />
                        {isLive ? "Live" : "Go Live"}
                    </Button>
                    <div className="h-4 w-px bg-border mx-2" />

                    <div className="relative w-[200px]">
                        <Select
                            value={selectedToken}
                            onChange={(e) => handleFilterChange(e.target.value)}
                        >
                            <option value="all">All Tokens</option>
                            {tokens.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </Select>
                        <Filter className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none opacity-50" />
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

                    <div className="h-4 w-px bg-border mx-2" />

                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            disabled={page === 0 || loading}
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-xs w-12 text-center font-mono">
                            Pg {page + 1}
                        </span>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            disabled={logs.length < PAGE_SIZE || loading}
                            onClick={() => setPage(p => p + 1)}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Stats row (for current view) */}
            <div className="grid grid-cols-4 gap-3">
                <StatCard
                    icon={Activity}
                    label="Requests (Page)"
                    value={totalRequests.toLocaleString()}
                    color="bg-blue-500/10 text-blue-400"
                />
                <StatCard
                    icon={Clock}
                    label="Avg Latency"
                    value={`${avgLatency}ms`}
                    color="bg-emerald-500/10 text-emerald-400"
                />
                <StatCard
                    icon={DollarSign}
                    label="Cost (Est.)"
                    value={`$${totalCost.toFixed(4)}`}
                    color="bg-amber-500/10 text-amber-400"
                />
                <StatCard
                    icon={Cpu}
                    label="Tokens"
                    value={totalTokens.toLocaleString()}
                    color="bg-violet-500/10 text-violet-400"
                />
            </div>

            {/* Table */}
            {loading ? (
                <PageSkeleton cards={4} rows={8} />
            ) : logs.length === 0 ? (
                <EmptyState
                    icon={Search}
                    title="No traffic found"
                    description={selectedToken !== "all" ? "No logs found for this filter." : "Make a request through the gateway to see it here."}
                    actionLabel={selectedToken !== "all" ? "Clear Filter" : undefined}
                    onAction={selectedToken !== "all" ? () => handleFilterChange("all") : undefined}
                    className="bg-card/50 backdrop-blur-sm"
                />
            ) : (
                <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden animate-in fade-in-50">
                    <DataTable
                        columns={columns}
                        data={logs}
                        onRowClick={handleRowClick}
                    />
                </div>
            )}
        </div>
    )
}
