"use client";

import { useState, useEffect, useCallback } from "react";
import { listApprovals, decideApproval, ApprovalRequest } from "@/lib/api";
import { RefreshCw, Clock, CheckCircle, XCircle, Eye, ArrowUpRight, X, User, Calendar, FileJson, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { columns } from "./columns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";

export default function ApprovalsPage() {
    const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [detailRequest, setDetailRequest] = useState<ApprovalRequest | null>(null);

    const fetchApprovals = useCallback(async () => {
        try {
            setLoading(true);
            const data = await listApprovals();
            // Sort: Pending first, then by date descending
            const sorted = data.sort((a, b) => {
                if (a.status === 'pending' && b.status !== 'pending') return -1;
                if (a.status !== 'pending' && b.status === 'pending') return 1;
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });
            setApprovals(sorted);
        } catch {
            toast.error("Failed to load approvals");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchApprovals();
        const interval = setInterval(fetchApprovals, 5000); // Auto-refresh every 5s
        return () => clearInterval(interval);
    }, [fetchApprovals]);

    const handleDecision = async (id: string, decision: "approved" | "rejected") => {
        try {
            await decideApproval(id, decision);
            toast.success(`Request ${decision}`);
            setDetailRequest(null);
            fetchApprovals();
        } catch {
            toast.error(`Failed to ${decision} request`);
        }
    };

    const pendingCount = approvals.filter(a => a.status === 'pending').length;
    const approvedCount = approvals.filter(a => a.status === 'approved').length;
    const rejectedCount = approvals.filter(a => a.status === 'rejected').length;

    return (
        <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
            <div className="flex items-center justify-between animate-fade-in">
                <div className="space-y-1">
                    <h2 className="text-3xl font-bold tracking-tight">Approvals</h2>
                    <p className="text-muted-foreground">Human-in-the-Loop requests waiting for decision</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fetchApprovals} disabled={loading}>
                        <RefreshCw className={cn("h-3.5 w-3.5 mr-2", loading && "animate-spin")} />
                        Refresh
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3 animate-slide-up">
                <KPICard
                    icon={Clock}
                    value={pendingCount}
                    label="Pending Review"
                    color="amber"
                    animate={pendingCount > 0}
                />
                <KPICard
                    icon={CheckCircle}
                    value={approvedCount}
                    label="Approved"
                    color="emerald"
                />
                <KPICard
                    icon={XCircle}
                    value={rejectedCount}
                    label="Rejected"
                    color="rose"
                />
            </div>

            <div className="animate-slide-up stagger-2">
                <DataTable
                    columns={columns}
                    data={approvals}
                    searchKey="id"
                    searchPlaceholder="Filter by Request ID..."
                    meta={{
                        onView: (r: ApprovalRequest) => setDetailRequest(r),
                    }}
                />
            </div>

            {/* Detail Slide-Over */}
            {detailRequest && (
                <ApprovalDetailPanel
                    request={detailRequest}
                    onClose={() => setDetailRequest(null)}
                    onDecide={handleDecision}
                />
            )}
        </div>
    );
}

// ── Components ────────────────────────────────────

function KPICard({ icon: Icon, value, label, color, animate }: {
    icon: React.ComponentType<{ className?: string }>;
    value: number;
    label: string;
    color: "amber" | "emerald" | "rose";
    animate?: boolean;
}) {
    const colors = {
        amber: "icon-circle-amber",
        emerald: "icon-circle-emerald",
        rose: "icon-circle-rose",
    };
    const textColors = {
        amber: "text-amber-500",
        emerald: "text-emerald-500",
        rose: "text-rose-500",
    };

    return (
        <Card className={cn("glass-card hover-lift p-4", animate && "animate-glow border-amber-500/30")}>
            <div className="flex items-center gap-3">
                <div className={cn(colors[color])}>
                    <Icon className="h-4 w-4" />
                </div>
                <div>
                    <p className={cn("text-2xl font-bold tabular-nums", textColors[color])}>
                        {value}
                    </p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                </div>
            </div>
        </Card>
    );
}

function ApprovalDetailPanel({ request, onClose, onDecide }: {
    request: ApprovalRequest;
    onClose: () => void;
    onDecide: (id: string, decision: "approved" | "rejected") => void;
}) {
    const summary = request.request_summary as Record<string, unknown>;

    return (
        <div className="fixed inset-y-0 right-0 w-[600px] z-50 bg-card/95 backdrop-blur-xl border-l border-border shadow-2xl flex flex-col animate-slide-in-right">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-semibold text-sm truncate">Request Details</h3>
                        <p className="text-[11px] text-muted-foreground font-mono truncate">{request.id}</p>
                    </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Meta Grid */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Status</p>
                        <Badge
                            variant={request.status === "pending" ? "warning" : request.status === "approved" ? "success" : "destructive"}
                            className="capitalize"
                        >
                            {request.status}
                        </Badge>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Expires</p>
                        <p className="text-sm font-mono text-muted-foreground">
                            {formatDistanceToNow(new Date(request.expires_at), { addSuffix: true })}
                        </p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Created</p>
                        <p className="text-sm font-mono text-muted-foreground">
                            {new Date(request.created_at).toLocaleString()}
                        </p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Token ID</p>
                        <p className="text-xs font-mono text-muted-foreground truncate" title={request.token_id || ""}>
                            {request.token_id || "—"}
                        </p>
                    </div>
                </div>

                {/* HTTPS Request Preview */}
                <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <ArrowUpRight className="h-3 w-3" /> HTTP Request
                    </p>
                    <div className="rounded-lg border border-border bg-muted/20 p-4 font-mono text-xs overflow-x-auto">
                        <div className="mb-2 text-sm font-bold text-primary">
                            {String(summary.method || "GET")} <span className="text-foreground">{String(summary.uri || "/")}</span>
                        </div>
                        {Boolean(summary.headers) && typeof summary.headers === 'object' && (
                            <div className="mb-4 text-muted-foreground space-y-0.5">
                                {Object.entries(summary.headers as Record<string, string>).map(([k, v]) => (
                                    <div key={k} className="flex">
                                        <span className="font-semibold mr-2 text-foreground/70">{k}:</span>
                                        <span className="truncate">{String(v)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {Boolean(summary.body) && (
                            <div className="bg-background/50 rounded p-3 border border-border/50 text-foreground/90 whitespace-pre-wrap">
                                {typeof summary.body === 'string'
                                    ? summary.body
                                    : JSON.stringify(summary.body, null, 2)}
                            </div>
                        )}
                    </div>
                </div>

                {/* Raw JSON */}
                <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <FileJson className="h-3 w-3" /> Raw Metadata
                    </p>
                    <pre className="rounded-lg border border-border bg-muted/20 p-3 text-[10px] font-mono text-muted-foreground overflow-x-auto max-h-[150px]">
                        {JSON.stringify(request, null, 2)}
                    </pre>
                </div>
            </div>

            {/* Footer Actions */}
            {request.status === "pending" && (
                <div className="border-t border-border p-6 bg-muted/10">
                    <div className="flex items-center gap-3">
                        <Button
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => onDecide(request.id, "approved")}
                        >
                            <CheckCircle className="mr-2 h-4 w-4" /> Approve Request
                        </Button>
                        <Button
                            className="flex-1"
                            variant="destructive"
                            onClick={() => onDecide(request.id, "rejected")}
                        >
                            <XCircle className="mr-2 h-4 w-4" /> Reject Request
                        </Button>
                    </div>
                    <p className="text-[10px] text-center text-muted-foreground mt-3">
                        Action will be applied immediately and implementation plan artifacts updated.
                    </p>
                </div>
            )}
        </div>
    );
}
