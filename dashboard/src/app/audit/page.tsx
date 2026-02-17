"use client"

import { useEffect, useState, useCallback } from "react"
import { listAuditLogs, getAuditLogDetail, AuditLog, AuditLogDetail } from "@/lib/api"
import { DataTable } from "@/components/data-table"
import { columns } from "./columns"
import {
    Activity,
    Clock,
    DollarSign,
    Cpu,
    ArrowRight,
    X,
    Copy,
    CheckCircle2,
    XCircle,
    Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

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

// ── Detail Panel ─────────────────────────────────

function DetailPanel({
    log,
    onClose,
}: {
    log: AuditLogDetail
    onClose: () => void
}) {
    const [copied, setCopied] = useState(false)

    const copyCurl = useCallback(() => {
        const curl = `curl -X ${log.method} '${log.upstream_url}${log.path}'${log.request_body ? ` \\\n  -H 'Content-Type: application/json' \\\n  -d '${log.request_body}'` : ""}`
        navigator.clipboard.writeText(curl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }, [log])

    const statusColor =
        !log.upstream_status ? "text-muted-foreground" :
            log.upstream_status < 300 ? "text-emerald-400" :
                log.upstream_status < 500 ? "text-amber-400" : "text-rose-400"

    const logLevelLabel = log.log_level === 0 ? "Metadata Only" :
        log.log_level === 1 ? "Redacted" : log.log_level === 2 ? "Full Debug" : "Unknown"

    return (
        <div className="fixed inset-y-0 right-0 w-[520px] bg-background/95 backdrop-blur-lg border-l border-border z-50 flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="text-[10px] shrink-0">{log.method}</Badge>
                    <span className="font-mono text-sm truncate">{log.path}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0 shrink-0">
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Summary row */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Status</p>
                        <p className={`text-lg font-bold font-mono ${statusColor}`}>
                            {log.upstream_status ?? "—"}
                        </p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Latency</p>
                        <p className="text-lg font-bold font-mono">{log.response_latency_ms}ms</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Cost</p>
                        <p className="text-lg font-bold font-mono text-amber-400">
                            {log.estimated_cost_usd ? `$${parseFloat(log.estimated_cost_usd).toFixed(4)}` : "—"}
                        </p>
                    </div>
                </div>

                {/* AI Signals */}
                {(log.model || log.prompt_tokens != null) && (
                    <div className="space-y-2">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Signals</h3>
                        <div className="grid grid-cols-2 gap-2">
                            {log.model && (
                                <div className="flex items-center gap-2 rounded-lg bg-violet-500/10 px-3 py-2">
                                    <Cpu className="h-3.5 w-3.5 text-violet-400" />
                                    <span className="text-sm font-medium">{log.model}</span>
                                </div>
                            )}
                            {log.tokens_per_second != null && (
                                <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 px-3 py-2">
                                    <Zap className="h-3.5 w-3.5 text-blue-400" />
                                    <span className="text-sm font-medium">{log.tokens_per_second.toFixed(1)} tok/s</span>
                                </div>
                            )}
                        </div>
                        {(log.prompt_tokens != null || log.completion_tokens != null) && (
                            <div className="flex items-center gap-2 text-sm font-mono bg-muted/30 rounded-lg px-3 py-2">
                                <span className="text-blue-400">{log.prompt_tokens ?? 0} prompt</span>
                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                <span className="text-emerald-400">{log.completion_tokens ?? 0} completion</span>
                                <span className="text-muted-foreground ml-auto">
                                    = {(log.prompt_tokens ?? 0) + (log.completion_tokens ?? 0)} total
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Attribution */}
                {(log.user_id || log.tenant_id || log.external_request_id) && (
                    <div className="space-y-2">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attribution</h3>
                        <div className="space-y-1">
                            {log.user_id && (
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">User ID</span>
                                    <span className="font-mono">{log.user_id}</span>
                                </div>
                            )}
                            {log.tenant_id && (
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">Tenant ID</span>
                                    <span className="font-mono">{log.tenant_id}</span>
                                </div>
                            )}
                            {log.external_request_id && (
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">Request ID</span>
                                    <span className="font-mono">{log.external_request_id}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Policy */}
                <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Policy</h3>
                    <div className="flex items-center gap-2">
                        {log.policy_result === "allowed" || log.policy_result === "approved" ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : (
                            <XCircle className="h-4 w-4 text-rose-400" />
                        )}
                        <span className="text-sm capitalize font-medium">{log.policy_result}</span>
                        {log.policy_mode && (
                            <Badge variant="outline" className="text-[10px]">{log.policy_mode}</Badge>
                        )}
                    </div>
                    {log.deny_reason && (
                        <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{log.deny_reason}</p>
                    )}
                </div>

                {/* Privacy Level */}
                <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Privacy Level</span>
                    <Badge variant="outline" className="text-[10px]">
                        L{log.log_level} — {logLevelLabel}
                    </Badge>
                </div>

                {/* Request Body */}
                {log.request_body && log.request_body !== "[EXPIRED]" && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Request Body</h3>
                            <Button variant="ghost" size="sm" onClick={copyCurl} className="h-6 text-[10px] gap-1 px-2">
                                <Copy className="h-3 w-3" />
                                {copied ? "Copied!" : "Copy as cURL"}
                            </Button>
                        </div>
                        <pre className="text-xs font-mono bg-muted/40 rounded-lg p-3 overflow-auto max-h-[200px] whitespace-pre-wrap break-all">
                            {tryFormatJSON(log.request_body)}
                        </pre>
                    </div>
                )}

                {/* Response Body */}
                {log.response_body && log.response_body !== "[EXPIRED]" && (
                    <div className="space-y-2">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Response Body</h3>
                        <pre className="text-xs font-mono bg-muted/40 rounded-lg p-3 overflow-auto max-h-[200px] whitespace-pre-wrap break-all">
                            {tryFormatJSON(log.response_body)}
                        </pre>
                    </div>
                )}

                {/* Headers (Level 2 only) */}
                {log.request_headers && (
                    <div className="space-y-2">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Request Headers</h3>
                        <pre className="text-xs font-mono bg-muted/40 rounded-lg p-3 overflow-auto max-h-[120px] whitespace-pre-wrap">
                            {JSON.stringify(log.request_headers, null, 2)}
                        </pre>
                    </div>
                )}
                {log.response_headers && (
                    <div className="space-y-2">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Response Headers</h3>
                        <pre className="text-xs font-mono bg-muted/40 rounded-lg p-3 overflow-auto max-h-[120px] whitespace-pre-wrap">
                            {JSON.stringify(log.response_headers, null, 2)}
                        </pre>
                    </div>
                )}

                {/* Metadata */}
                <div className="space-y-2 border-t border-border pt-4">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Metadata</h3>
                    <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Request ID</span>
                            <span className="font-mono">{log.id}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Token</span>
                            <span className="font-mono truncate max-w-[200px]">{log.token_id ?? "—"}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Agent</span>
                            <span>{log.agent_name ?? "—"}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Timestamp</span>
                            <span className="font-mono">{new Date(log.created_at).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function tryFormatJSON(str: string): string {
    try {
        return JSON.stringify(JSON.parse(str), null, 2)
    } catch {
        return str
    }
}

// ── Page ──────────────────────────────────────────

export default function AuditPage() {
    const [logs, setLogs] = useState<AuditLog[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedLog, setSelectedLog] = useState<AuditLogDetail | null>(null)
    const [detailLoading, setDetailLoading] = useState(false)

    useEffect(() => {
        listAuditLogs(100)
            .then(setLogs)
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [])

    const handleRowClick = useCallback(async (log: AuditLog) => {
        setDetailLoading(true)
        try {
            const detail = await getAuditLogDetail(log.id)
            setSelectedLog(detail)
        } catch (e) {
            console.error("Failed to load detail:", e)
        } finally {
            setDetailLoading(false)
        }
    }, [])

    // Summary stats — exclude HITL requests from latency (they include human wait time)
    const totalRequests = logs.length
    const nonHitlLogs = logs.filter(l => !["approved", "rejected", "timeout"].includes(l.policy_result))
    const avgLatency = nonHitlLogs.length > 0
        ? Math.round(nonHitlLogs.reduce((s, l) => s + l.response_latency_ms, 0) / nonHitlLogs.length)
        : 0
    const totalCost = logs.reduce((s, l) => s + (l.estimated_cost_usd ? parseFloat(l.estimated_cost_usd) : 0), 0)
    const totalTokens = logs.reduce((s, l) => s + (l.prompt_tokens ?? 0) + (l.completion_tokens ?? 0), 0)

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Traffic Inspector</h1>
                <p className="text-muted-foreground text-sm">
                    Real-time request log with AI golden signals and privacy-gated body inspection.
                </p>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-3">
                <StatCard
                    icon={Activity}
                    label="Total Requests"
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
                    label="Total Cost"
                    value={`$${totalCost.toFixed(4)}`}
                    color="bg-amber-500/10 text-amber-400"
                />
                <StatCard
                    icon={Cpu}
                    label="Total Tokens"
                    value={totalTokens.toLocaleString()}
                    color="bg-violet-500/10 text-violet-400"
                />
            </div>

            {/* Table */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
            ) : (
                <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
                    <DataTable
                        columns={columns}
                        data={logs}
                        onRowClick={handleRowClick}
                    />
                </div>
            )}

            {/* Detail panel */}
            {selectedLog && (
                <>
                    <div
                        className="fixed inset-0 bg-black/40 z-40"
                        onClick={() => setSelectedLog(null)}
                    />
                    <DetailPanel log={selectedLog} onClose={() => setSelectedLog(null)} />
                </>
            )}

            {/* Loading overlay for detail */}
            {detailLoading && (
                <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
            )}
        </div>
    )
}
