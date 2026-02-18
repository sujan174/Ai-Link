"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken, listAuditLogs, getTokenUsage, Token, AuditLog, TokenUsageStats } from "@/lib/api";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
    Key,
    Shield,
    Calendar,
    ArrowLeft,
    Activity,
    Clock,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Copy,
    Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { columns } from "@/app/audit/columns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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

export default function TokenDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [token, setToken] = useState<Token | null>(null);
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [usage, setUsage] = useState<TokenUsageStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!id) return;

        const loadData = async () => {
            try {
                const [t, l, u] = await Promise.all([
                    getToken(id),
                    listAuditLogs(50, 0, { token_id: id }),
                    getTokenUsage(id)
                ]);
                setToken(t);
                setLogs(l);
                setUsage(u);
            } catch (e) {
                console.error(e);
                toast.error("Failed to load token details");
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [id]);

    const handleCopy = () => {
        if (!token) return;
        navigator.clipboard.writeText(token.id);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
        );
    }

    if (!token) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
                <AlertTriangle className="h-10 w-10 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Token not found</h2>
                <Button onClick={() => router.back()}>Go Back</Button>
            </div>
        );
    }

    // Stats from logs
    const totalRequests = logs.length; // This is just the recent 50, but gives an idea
    const errorCount = logs.filter(l => (l.upstream_status || 0) >= 400).length;
    const avgLatency = logs.length > 0
        ? Math.round(logs.reduce((s, l) => s + l.response_latency_ms, 0) / logs.length)
        : 0;

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-20">
            {/* Nav */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => router.push('/tokens')} className="gap-2">
                        <ArrowLeft className="h-4 w-4" /> Back to Tokens
                    </Button>
                    <div className="h-4 w-px bg-border" />
                    <div className="flex items-center gap-2">
                        <Key className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold text-lg">{token.name}</span>
                        <Badge variant={token.is_active ? "default" : "secondary"} className="ml-2">
                            {token.is_active ? "Active" : "Inactive"}
                        </Badge>
                    </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2">
                    <Copy className="h-3.5 w-3.5" />
                    {copied ? "Copied ID" : "Copy ID"}
                </Button>
            </div>

            {/* Usage Chart */}
            {usage && (
                <Card className="glass-card">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">24h Traffic Volume</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[200px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={usage.hourly}>
                                    <defs>
                                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="bucket" hide />
                                    <YAxis hide />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '8px', fontSize: '12px' }}
                                        itemStyle={{ color: '#fff' }}
                                        labelStyle={{ color: '#aaa' }}
                                        formatter={(value: any) => [value, "Requests"]}
                                        labelFormatter={(label: any) => new Date(label).toLocaleTimeString()}
                                    />
                                    <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorCount)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">Total Requests</p>
                                <p className="text-2xl font-bold tabular-nums">{usage.total_requests.toLocaleString()}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">Success Rate</p>
                                <p className="text-2xl font-bold tabular-nums text-emerald-500">
                                    {usage.total_requests > 0 ? ((usage.success_count / usage.total_requests) * 100).toFixed(1) : 0}%
                                </p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">Avg Latency</p>
                                <p className="text-2xl font-bold tabular-nums text-amber-500">{Math.round(usage.avg_latency_ms)}ms</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">Est. Cost</p>
                                <p className="text-2xl font-bold tabular-nums text-violet-500">${usage.total_cost_usd.toFixed(4)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Info Cards */}
            <div className="grid md:grid-cols-3 gap-6">
                <Card className="glass-card md:col-span-2">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Token ID</p>
                            <p className="font-mono text-xs break-all">{token.id}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Created At</p>
                            <p className="font-mono text-xs">{new Date(token.created_at).toLocaleString()}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Credential ID</p>
                            <p className="font-mono text-xs break-all text-blue-400">{token.credential_id}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Upstream URL</p>
                            <p className="font-mono text-xs break-all">{token.upstream_url}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="glass-card">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Policies & scopes</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <p className="text-xs text-muted-foreground mb-2">Attached Policies</p>
                            <div className="flex flex-wrap gap-2">
                                {token.policy_ids.length > 0 ? token.policy_ids.map(pid => (
                                    <Badge key={pid} variant="outline" className="font-mono text-[10px] break-all">
                                        {pid}
                                    </Badge>
                                )) : (
                                    <span className="text-xs text-muted-foreground italic">No policies</span>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Activity */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold tracking-tight">Recent Activity</h2>
                    <div className="flex gap-2">
                        <Badge variant="outline" className="gap-1">
                            <Activity className="h-3 w-3" />
                            {logs.length} requests
                        </Badge>
                        <Badge variant="outline" className="gap-1 text-amber-500">
                            <Clock className="h-3 w-3" />
                            ~{avgLatency}ms avg
                        </Badge>
                        {errorCount > 0 && (
                            <Badge variant="outline" className="gap-1 text-rose-500">
                                <AlertTriangle className="h-3 w-3" />
                                {errorCount} errors
                            </Badge>
                        )}
                    </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
                    <DataTable
                        columns={columns}
                        data={logs}
                        onRowClick={(log) => router.push(`/audit/${log.id}`)}
                    />
                </div>
            </div>
        </div>
    );
}
