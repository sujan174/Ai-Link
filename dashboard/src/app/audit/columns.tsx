"use client"

import { ColumnDef } from "@tanstack/react-table"
import { AuditLog } from "@/lib/api"
import { ArrowUpDown, Eye, Cpu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export const columns: ColumnDef<AuditLog>[] = [
    {
        accessorKey: "created_at",
        header: ({ column }) => (
            <Button
                variant="ghost"
                onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                className="px-1"
            >
                Time
                <ArrowUpDown className="ml-1 h-3 w-3" />
            </Button>
        ),
        cell: ({ row }) => (
            <div className="text-muted-foreground text-xs whitespace-nowrap font-mono">
                {new Date(row.getValue("created_at")).toLocaleTimeString()}
            </div>
        ),
    },
    {
        accessorKey: "method",
        header: "Method",
        cell: ({ row }) => {
            const method = row.getValue("method") as string
            let variant: "default" | "secondary" | "outline" | "destructive" = "outline";
            if (method === "GET") variant = "secondary";
            if (method === "POST") variant = "default";
            if (method === "DELETE") variant = "destructive";

            return <Badge variant={variant} className="text-[10px] px-1.5 py-0">{method}</Badge>
        },
    },
    {
        accessorKey: "path",
        header: "Path",
        cell: ({ row }) => (
            <div className="font-mono text-xs max-w-[180px] truncate" title={row.getValue("path")}>
                {row.getValue("path")}
            </div>
        ),
    },
    {
        accessorKey: "model",
        header: "Model",
        cell: ({ row }) => {
            const model = row.getValue("model") as string | null;
            if (!model) return <span className="text-muted-foreground text-xs">—</span>;
            return (
                <div className="flex items-center gap-1">
                    <Cpu className="h-3 w-3 text-violet-500" />
                    <span className="text-xs font-medium truncate max-w-[100px]" title={model}>{model}</span>
                </div>
            );
        },
    },
    {
        accessorKey: "upstream_status",
        header: "Status",
        cell: ({ row }) => {
            const code = row.getValue("upstream_status") as number;
            if (!code) return <span className="text-muted-foreground">—</span>;

            let colorClass = "text-muted-foreground";
            if (code < 300) colorClass = "text-emerald-500 font-medium";
            else if (code < 400) colorClass = "text-blue-500";
            else if (code < 500) colorClass = "text-amber-500 font-medium";
            else colorClass = "text-rose-500 font-bold";

            return <div className={`font-mono text-xs ${colorClass}`}>{code}</div>
        },
    },
    {
        id: "tokens",
        header: "Tokens",
        cell: ({ row }) => {
            const prompt = row.original.prompt_tokens;
            const completion = row.original.completion_tokens;
            if (prompt == null && completion == null) {
                return <span className="text-muted-foreground text-xs">—</span>;
            }
            return (
                <div className="text-xs font-mono">
                    <span className="text-blue-400">{prompt ?? 0}</span>
                    <span className="text-muted-foreground mx-0.5">→</span>
                    <span className="text-emerald-400">{completion ?? 0}</span>
                </div>
            );
        },
    },
    {
        accessorKey: "response_latency_ms",
        header: ({ column }) => (
            <Button
                variant="ghost"
                onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                className="px-1"
            >
                Latency
                <ArrowUpDown className="ml-1 h-3 w-3" />
            </Button>
        ),
        cell: ({ row }) => {
            const result = row.original.policy_result;
            // HITL latency is human wait time, not proxy performance
            if (["approved", "rejected", "timeout"].includes(result)) {
                return <span className="text-muted-foreground text-xs">—</span>;
            }
            const ms = row.getValue("response_latency_ms") as number;
            const color = ms < 500 ? "text-emerald-400" : ms < 2000 ? "text-amber-400" : "text-rose-400";
            return <div className={`font-mono text-xs ${color}`}>{ms}ms</div>
        },
    },
    {
        accessorKey: "estimated_cost_usd",
        header: "Cost",
        cell: ({ row }) => {
            const cost = row.getValue("estimated_cost_usd") as string | null;
            if (!cost || cost === "0") return <span className="text-muted-foreground text-xs">—</span>;
            return <div className="font-mono text-xs text-amber-400">${parseFloat(cost).toFixed(4)}</div>;
        },
    },
    {
        accessorKey: "policy_result",
        header: "Policy",
        cell: ({ row }) => {
            const result = row.getValue("policy_result") as string;
            let variant: "default" | "destructive" | "warning" | "success" = "default";
            if (result === "allowed" || result === "approved") variant = "success";
            if (result === "denied" || result === "rejected") variant = "destructive";

            return <Badge variant={variant} className="capitalize text-[10px] px-1.5 py-0">{result}</Badge>
        }
    },
    {
        id: "user",
        header: "User",
        cell: ({ row }) => {
            const userId = row.original.user_id;
            if (!userId) return <span className="text-muted-foreground text-xs">—</span>;
            return (
                <div className="text-xs font-mono max-w-[80px] truncate" title={userId}>
                    {userId}
                </div>
            );
        },
    },
    {
        id: "actions",
        header: "",
        cell: () => (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <Eye className="h-3.5 w-3.5" />
            </Button>
        ),
    },
]
