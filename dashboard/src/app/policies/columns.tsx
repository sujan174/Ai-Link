"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Policy } from "@/lib/api"
import { ArrowUpDown, ShieldAlert, Trash2 } from "lucide-react"
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

export const columns: ColumnDef<Policy>[] = [
    {
        accessorKey: "name",
        header: ({ column }) => {
            return (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    Policy Name
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            )
        },
        cell: ({ row }) => <div className="font-medium">{row.getValue("name")}</div>,
    },
    {
        accessorKey: "mode",
        header: "Mode",
        cell: ({ row }) => {
            const mode = row.getValue("mode") as string
            let variant: "default" | "destructive" | "warning" | "secondary" | "outline" = "outline";
            if (mode === "blocking") variant = "destructive";
            if (mode === "shadow") variant = "secondary";
            if (mode === "log") variant = "outline";

            return <Badge variant={variant} className="capitalize">{mode}</Badge>
        },
    },
    {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => (
            <div className="text-muted-foreground text-xs whitespace-nowrap">
                {formatDistanceToNow(new Date(row.getValue("created_at")), { addSuffix: true })}
            </div>
        ),
    },
    {
        id: "actions",
        cell: ({ row }) => {
            const policy = row.original

            return (
                <Dialog>
                    <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Delete Policy?</DialogTitle>
                            <DialogDescription>
                                This action cannot be undone. This will permanently delete the
                                <span className="font-bold text-foreground"> {policy.name} </span>
                                policy and stop enforcing its rules.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button variant="outline">Cancel</Button>
                            </DialogClose>
                            <Button
                                variant="destructive"
                                onClick={async () => {
                                    try {
                                        await deletePolicy(policy.id);
                                        toast.success("Policy deleted");
                                        window.location.reload();
                                    } catch (e) {
                                        toast.error("Failed to delete policy");
                                    }
                                }}
                            >
                                Delete
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )
        },
    },
]
