"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getAuditLogDetail, AuditLogDetail } from "@/lib/api";
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
    ArrowLeft,
    Shield,
    Globe,
    Terminal,
    FileJson,
    User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function tryFormatJSON(str: string): string {
    try {
        return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
        return str;
    }
}

export default function AuditDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const [log, setLog] = useState<AuditLogDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!id) return;
        getAuditLogDetail(id)
            .then(setLog)
            .catch((e) => {
                console.error(e);
                // Optionally redirect or show error
            })
            .finally(() => setLoading(false));
    }, [id]);

    const copyCurl = useCallback(() => {
        if (!log) return;
        const curl = `curl -X ${log.method} '${log.upstream_url}${log.path}'${log.request_body ? ` \\\n  -H 'Content-Type: application/json' \\\n  -d '${log.request_body}'` : ""}`;
        navigator.clipboard.writeText(curl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [log]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
        );
    }

    if (!log) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
                <AlertTriangle className="h-10 w-10 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Log not found</h2>
                <Button onClick={() => router.back()}>Go Back</Button>
            </div>
        );
    }

    const statusColor =
        !log.upstream_status ? "text-muted-foreground" :
            log.upstream_status < 300 ? "text-emerald-400" :
                log.upstream_status < 500 ? "text-amber-400" : "text-rose-400";

    const logLevelLabel = log.log_level === 0 ? "Metadata Only" :
        log.log_level === 1 ? "Redacted" : log.log_level === 2 ? "Full Debug" : "Unknown";

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-20">
            {/* Nav */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-2">
                    <ArrowLeft className="h-4 w-4" /> Back to Logs
                </Button>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-mono">{log.id}</span>
                </div>
            </div>

            {/* Header Card */}
            <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm p-6 space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <Badge variant={log.method === "GET" ? "default" : "secondary"} className="text-xs font-mono">
                                {log.method}
                            </Badge>
                            <h1 className="text-xl font-bold font-mono tracking-tight break-all">{log.path}</h1>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Globe className="h-3.5 w-3.5" />
                            <span className="font-mono">{log.upstream_url}</span>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <Badge variant="outline" className={cn("text-sm font-mono px-3 py-1", statusColor)}>
                            {log.upstream_status ?? "—"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                            {new Date(log.created_at).toLocaleString()}
                        </span>
                    </div>
                </div>

                {/* KPI Grid for this request */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-border/50">
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" /> Latency
                        </p>
                        <p className="text-lg font-bold font-mono">{log.response_latency_ms}ms</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <DollarSign className="h-3.5 w-3.5" /> Cost
                        </p>
                        <p className="text-lg font-bold font-mono text-amber-400">
                            {log.estimated_cost_usd ? `$${parseFloat(log.estimated_cost_usd).toFixed(6)}` : "—"}
                        </p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <Cpu className="h-3.5 w-3.5" /> Tokens
                        </p>
                        <p className="text-lg font-bold font-mono">
                            {log.prompt_tokens || log.completion_tokens ? (log.prompt_tokens ?? 0) + (log.completion_tokens ?? 0) : "—"}
                        </p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <Shield className="h-3.5 w-3.5" /> Policy
                        </p>
                        <div className="flex items-center gap-2">
                            {log.policy_result === "allowed" || log.policy_result === "approved" ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            ) : (
                                <XCircle className="h-4 w-4 text-rose-400" />
                            )}
                            <span className="font-medium capitalize">{log.policy_result}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
                {/* Main Content (Left, 2 cols) */}
                <div className="md:col-span-2 space-y-6">
                    {/* Request Body */}
                    <Card className="glass-card">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Terminal className="h-4 w-4 text-blue-400" /> Request Payload
                            </CardTitle>
                            {log.request_body && log.request_body !== "[EXPIRED]" && (
                                <Button variant="ghost" size="sm" onClick={copyCurl} className="h-7 text-xs gap-1.5">
                                    <Copy className="h-3 w-3" />
                                    {copied ? "Copied!" : "Copy cURL"}
                                </Button>
                            )}
                        </CardHeader>
                        <CardContent>
                            {log.request_body && log.request_body !== "[EXPIRED]" ? (
                                <pre className="text-xs font-mono bg-muted/40 rounded-lg p-4 overflow-auto max-h-[400px] whitespace-pre-wrap break-all border border-border/50">
                                    {tryFormatJSON(log.request_body)}
                                </pre>
                            ) : (
                                <div className="h-20 flex items-center justify-center text-sm text-muted-foreground bg-muted/20 rounded-lg border border-dashed border-border/50">
                                    No body or expired
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Response Body */}
                    <Card className="glass-card">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <FileJson className="h-4 w-4 text-emerald-400" /> Response Body
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {log.response_body && log.response_body !== "[EXPIRED]" ? (
                                <pre className="text-xs font-mono bg-muted/40 rounded-lg p-4 overflow-auto max-h-[400px] whitespace-pre-wrap break-all border border-border/50">
                                    {tryFormatJSON(log.response_body)}
                                </pre>
                            ) : (
                                <div className="h-20 flex items-center justify-center text-sm text-muted-foreground bg-muted/20 rounded-lg border border-dashed border-border/50">
                                    No body or expired
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar (Right, 1 col) */}
                <div className="space-y-6">
                    {/* Headers */}
                    <Card className="glass-card">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Headers</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-2">Request</p>
                                <pre className="text-[10px] font-mono bg-muted/40 rounded-lg p-3 overflow-auto max-h-[200px] whitespace-pre-wrap border border-border/50">
                                    {log.request_headers ? JSON.stringify(log.request_headers, null, 2) : "—"}
                                </pre>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-2">Response</p>
                                <pre className="text-[10px] font-mono bg-muted/40 rounded-lg p-3 overflow-auto max-h-[200px] whitespace-pre-wrap border border-border/50">
                                    {log.response_headers ? JSON.stringify(log.response_headers, null, 2) : "—"}
                                </pre>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Metadata */}
                    <Card className="glass-card">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Metadata</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-xs">
                            <div className="grid grid-cols-[1fr_2fr] gap-2 items-center">
                                <span className="text-muted-foreground">ID</span>
                                <span className="font-mono truncate" title={log.id}>{log.id}</span>
                            </div>
                            <div className="grid grid-cols-[1fr_2fr] gap-2 items-center">
                                <span className="text-muted-foreground">Token ID</span>
                                <span className="font-mono truncate text-blue-400" title={log.token_id ?? ""}>{log.token_id ?? "—"}</span>
                            </div>
                            <div className="grid grid-cols-[1fr_2fr] gap-2 items-center">
                                <span className="text-muted-foreground">Agent</span>
                                <span>{log.agent_name ?? "—"}</span>
                            </div>
                            <div className="grid grid-cols-[1fr_2fr] gap-2 items-center">
                                <span className="text-muted-foreground">User ID</span>
                                <span className="font-mono truncate">{log.user_id ?? "—"}</span>
                            </div>
                            <div className="grid grid-cols-[1fr_2fr] gap-2 items-center">
                                <span className="text-muted-foreground">Log Level</span>
                                <Badge variant="outline" className="w-fit text-[10px]">L{log.log_level}</Badge>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Signals */}
                    {(log.model || log.tokens_per_second) && (
                        <Card className="glass-card">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <Zap className="h-4 w-4 text-yellow-400" /> AI Performance
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-xs">
                                {log.model && (
                                    <div className="flex justify-between items-center bg-violet-500/10 p-2 rounded-lg">
                                        <span className="text-violet-400 font-medium">Model</span>
                                        <span className="font-mono">{log.model}</span>
                                    </div>
                                )}
                                {log.tokens_per_second != null && (
                                    <div className="flex justify-between items-center bg-blue-500/10 p-2 rounded-lg">
                                        <span className="text-blue-400 font-medium">Speed</span>
                                        <span className="font-mono">{log.tokens_per_second.toFixed(1)} t/s</span>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}

import { AlertTriangle } from "lucide-react";
