"use client";

import { useState, useEffect, useCallback } from "react";
import { listCredentials, createCredential, rotateCredential, Credential } from "@/lib/api";
import { Fingerprint, Plus, Lock, RefreshCw, Server, RotateCw, Copy, Check, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function CredentialsPage() {
    const [credentials, setCredentials] = useState<Credential[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);

    // Rotation state
    const [rotatingId, setRotatingId] = useState<string | null>(null);
    const [newSecret, setNewSecret] = useState<string | null>(null);
    const [rotateLoading, setRotateLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    const fetchCredentials = useCallback(async () => {
        try {
            setLoading(true);
            const data = await listCredentials();
            setCredentials(data);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load credentials");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCredentials();
    }, [fetchCredentials]);

    const handleRotate = async () => {
        if (!rotatingId) return;
        setRotateLoading(true);
        try {
            const res = await rotateCredential(rotatingId);
            setNewSecret(res.secret);
            toast.success("Credential rotated successfully");
            fetchCredentials();
        } catch (e) {
            toast.error("Failed to rotate credential");
            setRotatingId(null); // Close on error
        } finally {
            setRotateLoading(false);
        }
    };

    const handleCopy = () => {
        if (newSecret) {
            navigator.clipboard.writeText(newSecret);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const activeCount = credentials.filter((c) => c.is_active).length;

    return (
        <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
            <div className="flex items-center justify-between animate-fade-in">
                <div className="space-y-1">
                    <h2 className="text-3xl font-bold tracking-tight">Credentials</h2>
                    <p className="text-muted-foreground">Encrypted API keys stored in the vault — secrets never leave the gateway</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fetchCredentials} disabled={loading}>
                        <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                        Refresh
                    </Button>
                    <Button onClick={() => setShowModal(true)}>
                        <Plus className="mr-2 h-4 w-4" /> Add Credential
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3 animate-slide-up">
                <Card className="glass-card hover-lift p-4">
                    <div className="flex items-center gap-3">
                        <div className="icon-circle-blue">
                            <Lock className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold tabular-nums">{credentials.length}</p>
                            <p className="text-xs text-muted-foreground">Total Credentials</p>
                        </div>
                    </div>
                </Card>
                <Card className="glass-card hover-lift p-4">
                    <div className="flex items-center gap-3">
                        <div className="icon-circle-emerald">
                            <Fingerprint className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold tabular-nums text-emerald-500">{activeCount}</p>
                            <p className="text-xs text-muted-foreground">Active</p>
                        </div>
                    </div>
                </Card>
                <Card className="glass-card hover-lift p-4">
                    <div className="flex items-center gap-3">
                        <div className="icon-circle-violet">
                            <Server className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold tabular-nums">{new Set(credentials.map((c) => c.provider)).size}</p>
                            <p className="text-xs text-muted-foreground">Providers</p>
                        </div>
                    </div>
                </Card>
            </div>

            {error && (
                <div className="bg-destructive/15 text-destructive border border-destructive/20 p-4 rounded-lg text-sm animate-slide-up">
                    {error}
                </div>
            )}

            <Card className="glass-card animate-slide-up stagger-2">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Provider</TableHead>
                            <TableHead>Version</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Created At</TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><div className="h-4 w-24 animate-pulse bg-muted rounded" /></TableCell>
                                    <TableCell><div className="h-4 w-16 animate-pulse bg-muted rounded" /></TableCell>
                                    <TableCell><div className="h-4 w-8 animate-pulse bg-muted rounded" /></TableCell>
                                    <TableCell><div className="h-4 w-12 animate-pulse bg-muted rounded" /></TableCell>
                                    <TableCell><div className="h-4 w-24 animate-pulse bg-muted rounded" /></TableCell>
                                    <TableCell><div className="h-4 w-8 animate-pulse bg-muted rounded" /></TableCell>
                                </TableRow>
                            ))
                        ) : credentials.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-96">
                                    <EmptyState
                                        icon={Lock}
                                        title="No credentials found"
                                        description="Add your first API key to the secure vault. We encrypt it with AES-256-GCM."
                                        actionLabel="Add Credential"
                                        onAction={() => setShowModal(true)}
                                    />
                                </TableCell>
                            </TableRow>
                        ) : (
                            credentials.map((cred) => (
                                <TableRow key={cred.id} className="hover:bg-muted/30 transition-colors">
                                    <TableCell className="font-medium text-foreground">{cred.name}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="font-mono text-xs">
                                            {cred.provider}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-xs">v{cred.version}</TableCell>
                                    <TableCell>
                                        <Badge variant={cred.is_active ? "success" : "secondary"} dot>
                                            {cred.is_active ? "Active" : "Revoked"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-xs">
                                        {new Date(cred.created_at).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            title="Rotate Credential"
                                            onClick={() => setRotatingId(cred.id)}
                                        >
                                            <RotateCw className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </Card>

            {/* Create Modal */}
            {showModal && (
                <CreateCredentialModal
                    onClose={() => setShowModal(false)}
                    onSuccess={() => {
                        setShowModal(false);
                        fetchCredentials();
                    }}
                />
            )}

            {/* Rotation Modal */}
            <Dialog open={!!rotatingId} onOpenChange={(open) => {
                if (!open) {
                    setRotatingId(null);
                    setNewSecret(null);
                }
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <RotateCw className="h-5 w-5 text-blue-500" />
                            Rotate Credential
                        </DialogTitle>
                        <DialogDescription>
                            Are you sure you want to rotate this credential? This will generate a new version.
                            Existing tokens will continue to work until you update them or revoke the old version.
                        </DialogDescription>
                    </DialogHeader>

                    {newSecret ? (
                        <div className="space-y-4 py-4">
                            <div className="rounded-lg bg-emerald-500/10 p-4 border border-emerald-500/20">
                                <div className="flex items-center gap-2 text-emerald-500 font-medium mb-2">
                                    <Check className="h-4 w-4" /> Rotation Successful
                                </div>
                                <p className="text-sm text-muted-foreground mb-4">
                                    Here is your new secret. Copy it now, you won't see it again.
                                </p>
                                <div className="relative">
                                    <pre className="p-3 bg-background rounded-md border border-border font-mono text-sm break-all pr-10">
                                        {newSecret}
                                    </pre>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="absolute right-1 top-1 h-7 w-7"
                                        onClick={handleCopy}
                                    >
                                        {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                                    </Button>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button onClick={() => {
                                    setRotatingId(null);
                                    setNewSecret(null);
                                }}>Done</Button>
                            </DialogFooter>
                        </div>
                    ) : (
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setRotatingId(null)}>Cancel</Button>
                            <Button onClick={handleRotate} disabled={rotateLoading}>
                                {rotateLoading && <RotateCw className="mr-2 h-4 w-4 animate-spin" />}
                                Rotate Key
                            </Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function CreateCredentialModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const [name, setName] = useState("");
    const [provider, setProvider] = useState("openai");
    const [secret, setSecret] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await createCredential({ name, provider, secret });
            toast.success("Credential created securely");
            onSuccess();
        } catch (e) {
            toast.error("Failed to create credential");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open onOpenChange={() => onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add Credential</DialogTitle>
                    <DialogDescription>
                        Securely store an API key. It will be encrypted at rest.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Name</Label>
                        <Input
                            id="name"
                            placeholder="e.g. OpenAI Prod"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="provider">Provider</Label>
                        <Input
                            id="provider"
                            placeholder="e.g. openai"
                            value={provider}
                            onChange={(e) => setProvider(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="secret">API Key / Secret</Label>
                        <div className="relative">
                            <Input
                                id="secret"
                                type="password"
                                placeholder="sk-..."
                                value={secret}
                                onChange={(e) => setSecret(e.target.value)}
                                required
                                className="pr-10"
                            />
                            <Lock className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                            <Lock className="inline h-3 w-3 mr-1" />
                            Encrypted with AES-256-GCM
                        </p>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                            Encrypt & Save
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
