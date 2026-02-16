"use client"

import { ColumnDef } from "@tanstack/react-table"
import { ApprovalRequest } from "@/lib/api"
import { ArrowUpDown, CheckCircle, XCircle, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatDistanceToNow } from "date-fns"
import { decideApproval } from "@/lib/api"
import { toast } from "sonner"

export const columns: ColumnDef<ApprovalRequest>[] = [
    {
        accessorKey: "created_at",
        header: ({ column }) => {
            return (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    Created
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            )
        },
        cell: ({ row }) => (
            <div className="text-muted-foreground text-xs whitespace-nowrap">
                {formatDistanceToNow(new Date(row.getValue("created_at")), { addSuffix: true })}
            </div>
        ),
    },
    {
        accessorKey: "id",
        header: "Request ID",
        cell: ({ row }) => <div className="font-mono text-xs">{row.getValue("id")}</div>,
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
                icon = <Clock className="mr-1 h-3 w-3" />;
            } else if (status === "approved") {
                variant = "success";
                icon = <CheckCircle className="mr-1 h-3 w-3" />;
            } else if (status === "rejected") {
                variant = "destructive";
                icon = <XCircle className="mr-1 h-3 w-3" />;
            }

            return (
                <Badge variant={variant} className="capitalize">
                    {icon}
                    {status}
                </Badge>
            )
        },
    },
    {
        accessorKey: "request_summary",
        header: "Summary",
        cell: ({ row }) => (
            <pre className="text-xs max-w-[300px] overflow-hidden truncate">
                {JSON.stringify(row.getValue("request_summary"))}
            </pre>
        ),
    },
    {
        id: "actions",
        cell: ({ row }) => {
            const request = row.original

            if (request.status !== "pending") return null;

            return (
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                        onClick={async () => {
                            try {
                                await decideApproval(request.id, "approved");
                                toast.success("Request approved");
                                window.location.reload();
                            } catch (e) {
                                toast.error("Failed to approve");
                            }
                        }}
                    >
                        Approve
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                        onClick={async () => {
                            try {
                                await decideApproval(request.id, "rejected");
                                toast.success("Request rejected");
                                window.location.reload();
                            } catch (e) {
                                toast.error("Failed to reject");
                            }
                        }}
                    >
                        Reject
                    </Button>
                </div>
            )
        },
    },
]
