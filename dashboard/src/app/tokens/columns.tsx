"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Token } from "@/lib/api"
import { MoreHorizontal, ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { revokeToken } from "@/lib/api"

export const columns: ColumnDef<Token>[] = [
    {
        accessorKey: "name",
        header: ({ column }) => {
            return (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    Name
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            )
        },
    },
    {
        accessorKey: "id",
        header: "Token ID",
        cell: ({ row }) => <div className="font-mono text-xs">{row.getValue("id")}</div>,
    },
    {
        accessorKey: "upstream_url",
        header: "Upstream",
        cell: ({ row }) => <div className="truncate max-w-[200px]">{row.getValue("upstream_url")}</div>,
    },
    {
        accessorKey: "is_active",
        header: "Status",
        cell: ({ row }) => {
            const active = row.getValue("is_active")
            return (
                <Badge variant={active ? "success" : "destructive"}>
                    {active ? "Active" : "Revoked"}
                </Badge>
            )
        },
    },
    {
        id: "actions",
        cell: ({ row }) => {
            const token = row.original

            return (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem
                            onClick={() => {
                                navigator.clipboard.writeText(token.id)
                                toast.success("Token ID copied to clipboard")
                            }}
                        >
                            Copy Token ID
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            className="text-red-600"
                            onClick={async () => {
                                try {
                                    await revokeToken(token.id);
                                    toast.success("Token revoked successfully");
                                    // Note: List refresh happens at page level; might need context or query invalidation 
                                    // But for now, we rely on the page to refresh or user to reload
                                    window.location.reload();
                                } catch {
                                    toast.error("Failed to revoke token");
                                }
                            }}
                        >
                            Revoke Token
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        },
    },
]
