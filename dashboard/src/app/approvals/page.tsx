"use client";

import { useState, useEffect, useCallback } from "react";
import { listApprovals, ApprovalRequest } from "@/lib/api";
import { RefreshCw, Clock, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { columns } from "./columns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function ApprovalsPage() {
    const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchApprovals = useCallback(async () => {
        try {
            setLoading(true);
            const data = await listApprovals();
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
        const interval = setInterval(fetchApprovals, 5000);
        return () => clearInterval(interval);
    }, [fetchApprovals]);

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
                <Button variant="outline" size="sm" onClick={fetchApprovals} disabled={loading}>
                    <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                    Refresh
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-3 animate-slide-up">
                <Card className={cn("glass-card hover-lift p-4", pendingCount > 0 && "animate-glow")}>
                    <div className="flex items-center gap-3">
                        <div className="icon-circle-amber">
                            <Clock className="h-4 w-4" />
                        </div>
                        <div>
                            <p className={cn("text-2xl font-bold tabular-nums", pendingCount > 0 ? "text-amber-500" : "text-muted-foreground")}>
                                {pendingCount}
                            </p>
                            <p className="text-xs text-muted-foreground">Pending</p>
                        </div>
                    </div>
                </Card>
                <Card className="glass-card hover-lift p-4">
                    <div className="flex items-center gap-3">
                        <div className="icon-circle-emerald">
                            <CheckCircle className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold tabular-nums text-emerald-500">{approvedCount}</p>
                            <p className="text-xs text-muted-foreground">Approved</p>
                        </div>
                    </div>
                </Card>
                <Card className="glass-card hover-lift p-4">
                    <div className="flex items-center gap-3">
                        <div className="icon-circle-rose">
                            <XCircle className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold tabular-nums text-rose-500">{rejectedCount}</p>
                            <p className="text-xs text-muted-foreground">Rejected</p>
                        </div>
                    </div>
                </Card>
            </div>

            <div className="animate-slide-up stagger-2">
                <DataTable columns={columns} data={approvals} searchKey="id" searchPlaceholder="Filter by Request ID..." />
            </div>
        </div>
    );
}
