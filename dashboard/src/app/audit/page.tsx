"use client";

import { useState, useEffect, useCallback } from "react";
import { listAuditLogs, AuditLog } from "@/lib/api";
import { RefreshCw, Activity, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { columns } from "./columns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function AuditPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchLogs = useCallback(async () => {
        try {
            setLoading(true);
            const data = await listAuditLogs(500, 0);
            setLogs(data);
        } catch (e) {
            toast.error("Failed to load audit logs");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const successCount = logs.filter(l => l.upstream_status && l.upstream_status < 400).length;
    const blockedCount = logs.filter(l => l.policy_result === "blocked").length;

    return (
        <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
            <div className="flex items-center justify-between animate-fade-in">
                <div className="space-y-1">
                    <h2 className="text-3xl font-bold tracking-tight">Audit Logs</h2>
                    <p className="text-muted-foreground">Request history, policy decisions, and latency metrics</p>
                </div>
                <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
                    <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                    Refresh
                </Button>
            </div>

            {/* Summary Bar */}
            <div className="grid gap-4 md:grid-cols-3 animate-slide-up">
                <Card className="glass-card hover-lift p-4">
                    <div className="flex items-center gap-3">
                        <div className="icon-circle-blue">
                            <Activity className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold tabular-nums">{logs.length}</p>
                            <p className="text-xs text-muted-foreground">Total Requests</p>
                        </div>
                    </div>
                </Card>
                <Card className="glass-card hover-lift p-4">
                    <div className="flex items-center gap-3">
                        <div className="icon-circle-emerald">
                            <Activity className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold tabular-nums text-emerald-500">{successCount}</p>
                            <p className="text-xs text-muted-foreground">Successful</p>
                        </div>
                    </div>
                </Card>
                <Card className="glass-card hover-lift p-4">
                    <div className="flex items-center gap-3">
                        <div className="icon-circle-rose">
                            <Activity className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold tabular-nums text-rose-500">{blockedCount}</p>
                            <p className="text-xs text-muted-foreground">Blocked by Policy</p>
                        </div>
                    </div>
                </Card>
            </div>

            <div className="animate-slide-up stagger-2">
                <Card className="glass-card border-l-4 border-l-primary mb-4">
                    <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono uppercase tracking-wider">
                            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            Live Stream (Last 500 requests)
                        </div>
                    </div>
                </Card>

                <DataTable columns={columns} data={logs} searchKey="path" searchPlaceholder="Filter by path..." />
            </div>
        </div>
    );
}
