"use client";

import { useState, useEffect, useCallback } from "react";
import { listCredentials, createCredential, Credential } from "@/lib/api";
import { Fingerprint, Plus, Lock, RefreshCw, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function CredentialsPage() {
    const [credentials, setCredentials] = useState<Credential[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);

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
                            <TableHead>Created</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            Array.from({ length: 3 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><div className="h-4 w-32 bg-muted/50 rounded shimmer" /></TableCell>
                                    <TableCell><div className="h-4 w-20 bg-muted/50 rounded shimmer" /></TableCell>
                                    <TableCell><div className="h-4 w-8 bg-muted/50 rounded shimmer" /></TableCell>
                                    <TableCell><div className="h-4 w-16 bg-muted/50 rounded shimmer" /></TableCell>
                                    <TableCell><div className="h-4 w-24 bg-muted/50 rounded shimmer" /></TableCell>
                                </TableRow>
                            ))
                        ) : credentials.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                    <Lock className="h-6 w-6 mx-auto mb-2 opacity-30" />
                                    No credentials found. Add an API key to get started.
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
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </Card>

            {showModal && (
                <CreateCredentialModal
                    onClose={() => setShowModal(false)}
                    onCreated={() => {
                        setShowModal(false);
                        fetchCredentials();
                    }}
                />
            )}
        </div>
    );
}

function CreateCredentialModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [name, setName] = useState("");
    const [provider, setProvider] = useState("openai");
    const [secret, setSecret] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async () => {
        if (!name || !secret) return;
        try {
            setSubmitting(true);
            setError(null);
            await createCredential({ name, provider, secret });
            onCreated();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to create");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <Card className="w-full max-w-md glass-card animate-scale-in">
                <CardHeader>
                    <CardTitle>Add Credential</CardTitle>
                    <CardDescription>Securely store a new API key.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Name</label>
                        <Input placeholder="e.g. openai-prod" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Provider</label>
                        <select
                            value={provider}
                            onChange={(e) => setProvider(e.target.value)}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                            <option value="openai" className="bg-popover text-popover-foreground">OpenAI</option>
                            <option value="anthropic" className="bg-popover text-popover-foreground">Anthropic</option>
                            <option value="google" className="bg-popover text-popover-foreground">Google</option>
                            <option value="custom" className="bg-popover text-popover-foreground">Custom</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">API Key</label>
                        <Input type="password" placeholder="sk-..." value={secret} onChange={(e) => setSecret(e.target.value)} />
                    </div>
                    <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 p-3 text-xs text-blue-500">
                        <Lock className="h-4 w-4 mt-0.5 shrink-0" />
                        <p>
                            Encrypted with AES-256-GCM envelope encryption. The plaintext key never leaves the gateway and is not viewable in the dashboard.
                        </p>
                    </div>
                    {error && <p className="text-xs text-destructive">{error}</p>}
                    <div className="flex justify-end gap-2 pt-4">
                        <Button variant="ghost" onClick={onClose}>Cancel</Button>
                        <Button onClick={handleSubmit} disabled={submitting}>
                            {submitting ? "Encrypting..." : "Add Credential"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
