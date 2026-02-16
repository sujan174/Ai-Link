"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Token } from "@/lib/api"
import { ArrowUpDown, CheckCircle, XCircle, MoreHorizontal, Trash2, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatDistanceToNow } from "date-fns"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"

export const columns: ColumnDef<Token>[] = [
    {
        accessorKey: "created_at",
        header: ({ column }) => {
            return (
                <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 h-8 data-[state=open]:bg-accent"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    Created
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            )
        },
        cell: ({ row }) => (
            <div className="text-muted-foreground text-xs whitespace-nowrap font-mono">
                {formatDistanceToNow(new Date(row.getValue("created_at")), { addSuffix: true })}
            </div>
        ),
    },
    {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => <div className="font-medium text-sm">{row.getValue("name")}</div>,
    },
    {
        accessorKey: "id",
        header: "Token ID",
        cell: ({ row }) => (
            <div className="flex items-center gap-2">
                <code className="relative rounded bg-muted/50 px-[0.3rem] py-[0.2rem] font-mono text-[10px] text-muted-foreground">
                    {row.getValue("id")}
                </code>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-50 hover:opacity-100"
                    onClick={() => {
                        navigator.clipboard.writeText(row.getValue("id"));
                        toast.success("Copied Token ID");
                    }}
                >
                    <Copy className="h-3 w-3" />
                </Button>
            </div>
        ),
    },
    {
        accessorKey: "credential_id",
        header: "Credential",
        cell: ({ row }) => (
            <code className="relative rounded bg-muted/30 px-[0.3rem] py-[0.2rem] font-mono text-[10px] text-muted-foreground truncate max-w-[120px]" title={row.getValue("credential_id")}>
                {row.getValue("credential_id")}
            </code>
        ),
    },
    {
        accessorKey: "is_active",
        header: "Status",
        cell: ({ row }) => {
            const isActive = row.getValue("is_active") as boolean;
            return (
                <Badge variant={isActive ? "success" : "secondary"} className="h-5 px-1.5 text-[10px]">
                    <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-zinc-500"}`} />
                    {isActive ? "Active" : "Revoked"}
                </Badge>
            )
        },
    },
    {
        id: "actions",
        cell: ({ row, table }) => {
            const token = row.original;
            const meta = table.options.meta as { onRevoke?: (t: Token) => void } | undefined;

            return (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem
                            onClick={() => {
                                navigator.clipboard.writeText(token.id);
                                toast.success("Copied");
                            }}
                        >
                            <Copy className="mr-2 h-3.5 w-3.5" />
                            Copy ID
                        </DropdownMenuItem>
                        {token.is_active && (
                            <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => meta?.onRevoke?.(token)}
                            >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                Revoke Token
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        },
    },
]
