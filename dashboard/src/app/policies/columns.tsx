"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Policy } from "@/lib/api"
import { ArrowUpDown, Trash2, Copy, Pencil, MoreHorizontal, Eye, ShieldCheck, ShieldAlert, ShieldBan, Zap, Clock, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatDistanceToNow } from "date-fns"
import { deletePolicy } from "@/lib/api"
import { toast } from "sonner"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose
} from "@/components/ui/dialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

// Helpers to analyze policy rules
function getRulesSummary(rules: unknown[]): string {
    if (!rules || rules.length === 0) return "No rules";
    const count = rules.length;
    const types = new Set<string>();
    for (const rule of rules) {
        const r = rule as Record<string, unknown>;
        const action = r.action as Record<string, string> | undefined;
        if (action) {
            const actionType = Object.keys(action)[0];
            if (actionType) types.add(actionType);
        }
        // Handle legacy format
        if (r.type) types.add(r.type as string);
    }
    if (types.size === 0) return `${count} rule${count > 1 ? "s" : ""}`;
    return `${count} rule${count > 1 ? "s" : ""} · ${[...types].join(", ")}`;
}

function getActionIcons(rules: unknown[]): string[] {
    const icons: string[] = [];
    for (const rule of rules) {
        const r = rule as Record<string, unknown>;
        const action = r.action as Record<string, unknown> | undefined;
        if (!action) {
            if (r.type === "spend_cap") icons.push("spend");
            if (r.type === "rate_limit") icons.push("rate");
            continue;
        }
        const type = Object.keys(action)[0];
        if (type && !icons.includes(type)) icons.push(type);
    }
    return icons;
}

function ActionIcon({ type }: { type: string }) {
    switch (type) {
        case "Deny": return <ShieldBan className="h-3 w-3 text-rose-400" />;
        case "RequireApproval": return <ShieldCheck className="h-3 w-3 text-amber-400" />;
        case "RateLimit": case "rate": return <Zap className="h-3 w-3 text-blue-400" />;
        case "Redact": return <ShieldAlert className="h-3 w-3 text-violet-400" />;
        case "Transform": return <FileText className="h-3 w-3 text-cyan-400" />;
        case "Log": return <FileText className="h-3 w-3 text-emerald-400" />;
        case "Throttle": return <Clock className="h-3 w-3 text-orange-400" />;
        case "spend": return <ShieldBan className="h-3 w-3 text-amber-400" />;
        default: return <ShieldAlert className="h-3 w-3 text-muted-foreground" />;
    }
}

export const columns: ColumnDef<Policy>[] = [
    {
        accessorKey: "name",
        header: ({ column }) => (
            <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 -ml-2"
                onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
                Policy
                <ArrowUpDown className="ml-1.5 h-3 w-3" />
            </Button>
        ),
        cell: ({ row }) => {
            const policy = row.original;
            const actionTypes = getActionIcons(policy.rules);
            return (
                <div className="flex items-center gap-3 min-w-[200px]">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
                        {actionTypes.length > 0 ? <ActionIcon type={actionTypes[0]} /> : <ShieldAlert className="h-3.5 w-3.5 text-primary" />}
                    </div>
                    <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{policy.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                            {getRulesSummary(policy.rules)}
                        </p>
                    </div>
                </div>
            );
        },
    },
    {
        accessorKey: "mode",
        header: "Mode",
        cell: ({ row }) => {
            const mode = row.getValue("mode") as string;
            return (
                <Badge
                    variant={mode === "blocking" ? "destructive" : mode === "shadow" ? "warning" : "secondary"}
                    dot
                    className="capitalize text-[11px]"
                >
                    {mode}
                </Badge>
            );
        },
    },
    {
        id: "actions_summary",
        header: "Actions",
        cell: ({ row }) => {
            const actionTypes = getActionIcons(row.original.rules);
            if (actionTypes.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
            return (
                <div className="flex items-center gap-1">
                    {actionTypes.map((type) => (
                        <div key={type} className="flex items-center gap-1 rounded-md bg-muted/50 px-1.5 py-0.5" title={type}>
                            <ActionIcon type={type} />
                            <span className="text-[10px] text-muted-foreground capitalize">{type}</span>
                        </div>
                    ))}
                </div>
            );
        },
    },
    {
        accessorKey: "is_active",
        header: "Status",
        cell: ({ row }) => {
            const active = row.getValue("is_active") as boolean;
            return (
                <Badge variant={active ? "success" : "secondary"} dot className="text-[11px]">
                    {active ? "Active" : "Disabled"}
                </Badge>
            );
        },
    },
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
                <ArrowUpDown className="ml-1.5 h-3 w-3" />
            </Button>
        ),
        cell: ({ row }) => (
            <div className="text-muted-foreground text-xs whitespace-nowrap font-mono">
                {formatDistanceToNow(new Date(row.getValue("created_at")), { addSuffix: true })}
            </div>
        ),
    },
    {
        id: "actions",
        cell: ({ row, table }) => {
            const policy = row.original;
            const meta = table.options.meta as { onView?: (p: Policy) => void; onEdit?: (p: Policy) => void; onRefresh?: () => void } | undefined;

            return (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => meta?.onView?.(policy)}>
                            <Eye className="mr-2 h-3.5 w-3.5" />
                            View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => meta?.onEdit?.(policy)}>
                            <Pencil className="mr-2 h-3.5 w-3.5" />
                            Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                            navigator.clipboard.writeText(policy.id);
                            toast.success("Policy ID copied");
                        }}>
                            <Copy className="mr-2 h-3.5 w-3.5" />
                            Copy ID
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <Dialog>
                            <DialogTrigger asChild>
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive">
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                                    Delete
                                </DropdownMenuItem>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Delete Policy?</DialogTitle>
                                    <DialogDescription>
                                        This will permanently delete <span className="font-bold text-foreground">{policy.name}</span> and stop enforcing its rules.
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                    <DialogClose asChild>
                                        <Button variant="outline" size="sm">Cancel</Button>
                                    </DialogClose>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={async () => {
                                            try {
                                                await deletePolicy(policy.id);
                                                toast.success("Policy deleted");
                                                meta?.onRefresh?.();
                                            } catch {
                                                toast.error("Failed to delete");
                                            }
                                        }}
                                    >
                                        Delete
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </DropdownMenuContent>
                </DropdownMenu>
            );
        },
    },
]
