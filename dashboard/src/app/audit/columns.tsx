"use client"

import { ColumnDef } from "@tanstack/react-table"
import { AuditLog } from "@/lib/api"
import { ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"


export const columns: ColumnDef<AuditLog>[] = [
    {
        accessorKey: "created_at",
        header: ({ column }) => {
            return (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    Timestamp
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            )
        },
        cell: ({ row }) => (
            <div className="text-muted-foreground text-xs whitespace-nowrap">
                {new Date(row.getValue("created_at")).toLocaleString()}
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

            return <Badge variant={variant}>{method}</Badge>
        },
    },
    {
        accessorKey: "path",
        header: "Path",
        cell: ({ row }) => <div className="font-mono text-xs max-w-[200px] truncate" title={row.getValue("path")}>{row.getValue("path")}</div>,
    },
    {
        accessorKey: "upstream_status",
        header: "Status",
        cell: ({ row }) => {
            const code = row.getValue("upstream_status") as number
            if (!code) return <span className="text-muted-foreground">-</span>;

            let colorClass = "text-muted-foreground";
            if (code < 300) colorClass = "text-emerald-600 font-medium";
            else if (code < 400) colorClass = "text-blue-600";
            else if (code < 500) colorClass = "text-amber-600 font-medium";
            else colorClass = "text-rose-600 font-bold";

            return <div className={colorClass}>{code}</div>
        },
    },
    {
        accessorKey: "response_latency_ms",
        header: ({ column }) => {
            return (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    Latency
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            )
        },
        cell: ({ row }) => {
            const ms = row.getValue("response_latency_ms") as number;
            return <div className="font-mono text-xs">{ms}ms</div>
        },
    },
    {
        accessorKey: "policy_result",
        header: "Policy",
        cell: ({ row }) => {
            const result = row.getValue("policy_result") as string;
            let variant: "default" | "destructive" | "warning" | "success" = "default";
            if (result === "allowed") variant = "success";
            if (result === "approved") variant = "success";
            if (result === "denied") variant = "destructive";
            if (result === "rejected") variant = "destructive";

            return <Badge variant={variant} className="capitalize text-[10px]">{result}</Badge>
        }
    },
]
