"use client";

import { useState, useEffect, useCallback } from "react";
import { listPolicies, createPolicy, Policy } from "@/lib/api";
import { RefreshCw, Plus, ShieldCheck, ShieldAlert, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { columns } from "./columns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PoliciesPage() {
    const [policies, setPolicies] = useState<Policy[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);

    const fetchPolicies = useCallback(async () => {
        try {
            setLoading(true);
            const data = await listPolicies();
            setPolicies(data);
        } catch {
            toast.error("Failed to load policies");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPolicies();
    }, [fetchPolicies]);

    const blockingCount = policies.filter(p => p.mode === 'blocking').length;
    const shadowCount = policies.filter(p => p.mode === 'shadow').length;

    return (
        <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
            <div className="flex items-center justify-between animate-fade-in">
                <div className="space-y-1">
                    <h2 className="text-3xl font-bold tracking-tight">Policies</h2>
                    <p className="text-muted-foreground">Guardrails and traffic control rules</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fetchPolicies} disabled={loading}>
                        <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                        Refresh
                    </Button>
                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="mr-2 h-4 w-4" /> Create Policy
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[500px]">
                            <CreatePolicyForm onSuccess={() => {
                                setOpen(false);
                                fetchPolicies();
                            }} />
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3 animate-slide-up">
                <Card className="glass-card hover-lift p-4">
                    <div className="flex items-center gap-3">
                        <div className="icon-circle-blue">
                            <ShieldAlert className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold tabular-nums">{policies.length}</p>
                            <p className="text-xs text-muted-foreground">Total Policies</p>
                        </div>
                    </div>
                </Card>
                <Card className="glass-card hover-lift p-4">
                    <div className="flex items-center gap-3">
                        <div className="icon-circle-emerald">
                            <ShieldCheck className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold tabular-nums text-emerald-500">{blockingCount}</p>
                            <p className="text-xs text-muted-foreground">Blocking (Enforced)</p>
                        </div>
                    </div>
                </Card>
                <Card className="glass-card hover-lift p-4">
                    <div className="flex items-center gap-3">
                        <div className="icon-circle-amber">
                            <Eye className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold tabular-nums text-amber-500">{shadowCount}</p>
                            <p className="text-xs text-muted-foreground">Shadow (Log Only)</p>
                        </div>
                    </div>
                </Card>
            </div>

            <div className="animate-slide-up stagger-2">
                <DataTable columns={columns} data={policies} searchKey="name" searchPlaceholder="Filter policies..." />
            </div>
        </div>
    );
}

function CreatePolicyForm({ onSuccess }: { onSuccess: () => void }) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        mode: "blocking",
        type: "spend_cap",
        max_usd: 1.0,
        window: "daily",
        max_requests: 100,
        rate_window: 60,
        custom_json: '[]'
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);
            let rules: unknown[] = [];
            if (formData.type === "spend_cap") {
                rules = [{ type: "spend_cap", max_usd: Number(formData.max_usd), window: formData.window }];
            } else if (formData.type === "rate_limit") {
                rules = [{ type: "rate_limit", max: Number(formData.max_requests), window: Number(formData.rate_window) }];
            } else {
                rules = JSON.parse(formData.custom_json);
            }
            await createPolicy({ name: formData.name, mode: formData.mode, project_id: "default", rules });
            toast.success("Policy created");
            onSuccess();
        } catch {
            toast.error("Failed to create policy");
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <DialogHeader>
                <DialogTitle>Create Policy</DialogTitle>
                <DialogDescription>Define traffic control rules.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right">Name</Label>
                    <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="col-span-3" required placeholder="e.g. Monthly Budget" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="mode" className="text-right">Mode</Label>
                    <select className="col-span-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.mode} onChange={(e) => setFormData({ ...formData, mode: e.target.value })}>
                        <option value="blocking">Blocking (Enforce)</option>
                        <option value="shadow">Shadow (Log only)</option>
                    </select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="type" className="text-right">Type</Label>
                    <select className="col-span-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}>
                        <option value="spend_cap">Spend Cap 💰</option>
                        <option value="rate_limit">Rate Limit ⚡</option>
                        <option value="custom">Advanced (JSON) 🔧</option>
                    </select>
                </div>
                {formData.type === "spend_cap" && (
                    <>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="max_usd" className="text-right">Limit ($)</Label>
                            <Input id="max_usd" type="number" step="0.01" value={formData.max_usd} onChange={(e) => setFormData({ ...formData, max_usd: parseFloat(e.target.value) })} className="col-span-3" required />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="window" className="text-right">Window</Label>
                            <select className="col-span-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.window} onChange={(e) => setFormData({ ...formData, window: e.target.value })}>
                                <option value="daily">Daily</option>
                                <option value="monthly">Monthly</option>
                            </select>
                        </div>
                    </>
                )}
                {formData.type === "rate_limit" && (
                    <>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="max_req" className="text-right">Max Req</Label>
                            <Input id="max_req" type="number" value={formData.max_requests} onChange={(e) => setFormData({ ...formData, max_requests: parseInt(e.target.value) })} className="col-span-3" required />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="win" className="text-right">Seconds</Label>
                            <Input id="win" type="number" value={formData.rate_window} onChange={(e) => setFormData({ ...formData, rate_window: parseInt(e.target.value) })} className="col-span-3" required />
                        </div>
                    </>
                )}
                {formData.type === "custom" && (
                    <div className="grid grid-cols-4 items-start gap-4">
                        <Label htmlFor="rules" className="text-right mt-2">JSON</Label>
                        <textarea className="col-span-3 flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono border-amber-500" value={formData.custom_json} onChange={(e) => setFormData({ ...formData, custom_json: e.target.value })} />
                    </div>
                )}
            </div>
            <DialogFooter>
                <Button type="submit" disabled={loading}>{loading ? "Saving..." : "Create Policy"}</Button>
            </DialogFooter>
        </form>
    )
}
