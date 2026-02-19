"use client";

import { useState, useEffect, useCallback } from "react";
import {
    listApiKeys,
    createApiKey,
    revokeApiKey,
    ApiKey,
    CreateApiKeyRequest,
    CreateApiKeyResponse
} from "@/lib/api";
import {
    Plus, RefreshCw, Key, Trash2, Loader2, Copy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { PageSkeleton } from "@/components/page-skeleton";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { columns } from "./columns";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function ApiKeysPage() {
    const router = useRouter();
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [revokeKeyData, setRevokeKeyData] = useState<ApiKey | null>(null);
    const [createdKey, setCreatedKey] = useState<CreateApiKeyResponse | null>(null);

    const fetchKeys = useCallback(async () => {
        try {
            setLoading(true);
            const data = await listApiKeys();
            // Sort active first, then by date
            const sorted = data.sort((a, b) => {
                if (a.is_active && !b.is_active) return -1;
                if (!a.is_active && b.is_active) return 1;
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });
            setKeys(sorted);
        } catch {
            toast.error("Failed to load API keys");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchKeys();
    }, [fetchKeys]);

    const handleRevoke = async () => {
        if (!revokeKeyData) return;
        try {
            await revokeApiKey(revokeKeyData.id);
            toast.success("API Key revoked successfully");
            setRevokeKeyData(null);
            fetchKeys();
        } catch {
            toast.error("Failed to revoke API key");
        }
    };

    return (
        <div className="p-8 space-y-6 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between animate-fade-in">
                <div className="space-y-1">
                    <h2 className="text-3xl font-bold tracking-tight">API Keys</h2>
                    <p className="text-muted-foreground text-sm">
                        Manage access keys for the AIlink Management API
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fetchKeys} disabled={loading}>
                        <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
                        Refresh
                    </Button>
                    <Dialog open={createOpen} onOpenChange={(open) => {
                        if (!open) setCreatedKey(null); // Reset on close
                        setCreateOpen(open);
                    }}>
                        <DialogTrigger asChild>
                            <Button size="sm">
                                <Plus className="h-4 w-4 mr-1.5" />
                                Create Key
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <CreateKeyForm
                                onSuccess={(key) => {
                                    setCreatedKey(key);
                                    fetchKeys();
                                }}
                                createdKey={createdKey}
                                onClose={() => setCreateOpen(false)}
                            />
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {loading ? (
                <PageSkeleton />
            ) : keys.length === 0 ? (
                <EmptyState
                    icon={Key}
                    title="No API Keys found"
                    description="Create an API key to access the Management API programmatically."
                    actionLabel="Create your first key"
                    onAction={() => setCreateOpen(true)}
                />
            ) : (
                <div className="grid gap-6 animate-fade-in duration-500">
                    <Card>
                        <DataTable
                            columns={columns}
                            data={keys}
                            searchKey="name"
                            meta={{ onRevoke: setRevokeKeyData }}
                        />
                    </Card>
                </div>
            )}

            {/* Revoke Dialog */}
            <Dialog open={!!revokeKeyData} onOpenChange={(open) => !open && setRevokeKeyData(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Revoke API Key</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to revoke <span className="font-mono font-medium text-foreground">{revokeKeyData?.name}</span>?
                            This action cannot be undone and any applications using this key will immediately lose access.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRevokeKeyData(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleRevoke}>
                            Revoke Key
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function CreateKeyForm({ onSuccess, createdKey, onClose }: { onSuccess: (k: CreateApiKeyResponse) => void, createdKey: CreateApiKeyResponse | null, onClose: () => void }) {
    const [name, setName] = useState("");
    const [role, setRole] = useState("member");
    const [scopes, setScopes] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const availableScopes = [
        "tokens:read", "tokens:write",
        "policies:read", "policies:write",
        "credentials:read", "credentials:write",
        "approvals:read", "approvals:write",
        "audit:read",
        // "keys:manage" // Only admins can grant this, assume UI hides it or handles it based on current user role?
        // simple UI for now
    ];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsSubmitting(true);
            const res = await createApiKey({
                name,
                role,
                scopes: role === "admin" ? [] : scopes, // admins get all scopes implicitly
            });
            onSuccess(res);
            toast.success("API Key created");
        } catch (err) {
            toast.error("Failed to create key");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (createdKey) {
        return (
            <div className="space-y-4">
                <DialogHeader>
                    <DialogTitle>API Key Created</DialogTitle>
                    <DialogDescription>
                        Please copy your API key now. It will not be shown again.
                    </DialogDescription>
                </DialogHeader>
                <div className="p-4 bg-muted rounded-md border break-all font-mono text-sm relative group">
                    {createdKey.key}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-background/50 hover:bg-background"
                        onClick={() => {
                            navigator.clipboard.writeText(createdKey.key);
                            toast.success("Copied to clipboard");
                        }}
                    >
                        <Copy className="h-3 w-3" />
                    </Button>
                </div>
                <DialogFooter>
                    <Button onClick={onClose}>Done</Button>
                </DialogFooter>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>Create API Key</DialogTitle>
                <DialogDescription>Created a scoped API key for management access.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
                <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" placeholder="e.g. CI/CD Pipeline" value={name} onChange={e => setName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <select
                        id="role"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1"
                    >
                        <option value="readonly">Read Only</option>
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                    </select>
                    <p className="text-xs text-muted-foreground">
                        {role === "admin" ? "Admins have full access." :
                            role === "readonly" ? "Read-only access to all resources." :
                                "Can manage resources but not keys/users."}
                    </p>
                </div>
                {role !== "admin" && role !== "readonly" && (
                    <div className="space-y-2">
                        <Label>Scopes</Label>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            {availableScopes.map(scope => (
                                <div key={scope} className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id={scope}
                                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                        checked={scopes.includes(scope)}
                                        onChange={(e) => {
                                            if (e.target.checked) setScopes([...scopes, scope]);
                                            else setScopes(scopes.filter(s => s !== scope));
                                        }}
                                    />
                                    <label htmlFor={scope} className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                        {scope}
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting || !name}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Key
                </Button>
            </DialogFooter>
        </form>
    );
}
