"use client"

import { ColumnDef } from "@tanstack/react-table"
import { ApprovalRequest } from "@/lib/api"
import { ArrowUpDown, CheckCircle, XCircle, Clock, MoreHorizontal, Eye, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatDistanceToNow } from "date-fns"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export const columns: ColumnDef<ApprovalRequest>[] = [
    {
        accessorKey: "created_at",
        header: ({ column }) => (
            <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 -ml-2"
                onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
                Created
                <ArrowUpDown className="ml-2 h-3 w-3" />
            </Button>
        ),
        cell: ({ row }) => (
            <div className="text-muted-foreground text-xs whitespace-nowrap font-mono">
                {formatDistanceToNow(new Date(row.getValue("created_at")), { addSuffix: true })}
            </div>
        ),
    },
    {
        accessorKey: "id",
        header: "Request ID",
        cell: ({ row }) => (
            <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[120px]" title={row.getValue("id")}>
                {row.getValue("id")}
            </div>
        ),
    },
    {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
            const status = row.getValue("status") as string
            let variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" = "default";
            let icon = null;

            if (status === "pending") {
                variant = "warning";
                icon = <Clock className="mr-1.5 h-3 w-3" />;
            } else if (status === "approved") {
                variant = "success";
                icon = <CheckCircle className="mr-1.5 h-3 w-3" />;
            } else if (status === "rejected") {
                variant = "destructive";
                icon = <XCircle className="mr-1.5 h-3 w-3" />;
            }

            return (
                <Badge variant={variant} className="capitalize pl-2 pr-2.5 h-6">
                    {icon}
                    {status}
                </Badge>
            )
        },
    },
    {
        accessorKey: "request_summary",
        header: "Request",
        cell: ({ row }) => {
            const summary = row.getValue("request_summary") as Record<string, unknown>;
            const method = summary.method as string || "UNKNOWN";
            const uri = summary.uri as string || "/";
            return (
                <div className="flex items-center gap-2 max-w-[300px]">
                    <Badge variant="outline" className="font-mono text-[10px] px-1 h-5">{method}</Badge>
                    <span className="text-xs font-mono truncate text-muted-foreground" title={uri}>{uri}</span>
                </div>
            )
        },
    },
    {
        id: "actions",
        cell: ({ row, table }) => {
            const request = row.original;
            const meta = table.options.meta as { onView?: (r: ApprovalRequest) => void } | undefined;

            return (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => meta?.onView?.(request)}>
                            <Eye className="mr-2 h-3.5 w-3.5" />
                            View Details
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        },
    },
]
