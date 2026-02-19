"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import {
    createService,
    deleteService,
    listCredentials,
    Service,
    Credential,
    swrFetcher,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Plus, Trash2, Plug, Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export default function ServicesPage() {
    const { data: services = [], mutate: mutateServices, isLoading: servicesLoading } = useSWR<Service[]>("/services", swrFetcher);
    const { data: credentials = [], isLoading: credsLoading } = useSWR<Credential[]>("/credentials", swrFetcher);

    // Derived state
    const loading = servicesLoading || credsLoading;
    const [dialogOpen, setDialogOpen] = useState(false);

    // Form state
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [baseUrl, setBaseUrl] = useState("");
    const [serviceType, setServiceType] = useState("generic");
    const [credentialId, setCredentialId] = useState("");
    const [creating, setCreating] = useState(false);

    const handleCreate = async () => {
        if (!name || !baseUrl) {
            toast.error("Name and Base URL are required");
            return;
        }
        setCreating(true);

        const newService: Service = {
            id: "temp-" + Date.now(),
            project_id: "",
            name: name.toLowerCase().replace(/\s+/g, "-"),
            description,
            base_url: baseUrl,
            service_type: serviceType,
            credential_id: credentialId || null,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        try {
            await mutateServices(
                async () => {
                    const created = await createService({
                        name: newService.name,
                        description,
                        base_url: baseUrl,
                        service_type: serviceType,
                        credential_id: credentialId || undefined,
                    });
                    return [...services, created];
                },
                {
                    optimisticData: [...services, newService],
                    rollbackOnError: true,
                    revalidate: true,
                }
            );

            toast.success(`Service "${name}" registered`);
            setDialogOpen(false);
            setName("");
            setDescription("");
            setBaseUrl("");
            setServiceType("generic");
            setCredentialId("");
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            toast.error(`Failed to create service: ${msg}`);
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (id: string, svcName: string) => {
        if (!confirm(`Delete service "${svcName}"? This cannot be undone.`)) return;

        try {
            await mutateServices(
                async () => {
                    await deleteService(id);
                    return services.filter(s => s.id !== id);
                },
                {
                    optimisticData: services.filter(s => s.id !== id),
                    rollbackOnError: true,
                    revalidate: true
                }
            );
            toast.success(`Deleted "${svcName}"`);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            toast.error(`Failed to delete: ${msg}`);
        }
    };

    const getCredentialName = (credId: string | null) => {
        if (!credId) return "None";
        const cred = credentials.find((c) => c.id === credId);
        return cred ? cred.name : credId.slice(0, 8) + "…";
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-32">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <Plug className="h-8 w-8 text-blue-500" />
                        Services
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Register external APIs for automatic credential injection via the
                        Action Gateway.
                    </p>
                </div>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2">
                            <Plus className="h-4 w-4" />
                            Add Service
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle>Register New Service</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-2">
                            <div className="space-y-2">
                                <Label htmlFor="svc-name">Service Name</Label>
                                <Input
                                    id="svc-name"
                                    placeholder="e.g. stripe, slack, hubspot"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Used in the proxy URL: <code>/v1/proxy/services/{name || "…"}/</code>
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="svc-desc">Description</Label>
                                <Input
                                    id="svc-desc"
                                    placeholder="Optional description"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="svc-url">Base URL</Label>
                                <Input
                                    id="svc-url"
                                    placeholder="https://api.stripe.com"
                                    value={baseUrl}
                                    onChange={(e) => setBaseUrl(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Service Type</Label>
                                <Select
                                    value={serviceType}
                                    onChange={(e) => setServiceType(e.target.value)}
                                >
                                    <option value="generic">Generic API</option>
                                    <option value="llm">LLM Provider</option>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Credential</Label>
                                <Select
                                    value={credentialId}
                                    onChange={(e) => setCredentialId(e.target.value)}
                                >
                                    <option value="">Select a credential…</option>
                                    {credentials.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name} ({c.provider})
                                        </option>
                                    ))}
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    The API key to inject when proxying to this service.
                                </p>
                            </div>
                            <Button
                                onClick={handleCreate}
                                disabled={creating}
                                className="w-full"
                            >
                                {creating ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Registering…
                                    </>
                                ) : (
                                    "Register Service"
                                )}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {/* How it works */}
            <Card className="border-dashed border-blue-500/30 bg-blue-500/5">
                <CardContent className="py-4">
                    <p className="text-sm text-muted-foreground">
                        <strong className="text-foreground">How it works:</strong> Register a
                        service (e.g., Stripe) with its base URL and a credential. Then your AI
                        agent sends requests to{" "}
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                            POST /v1/proxy/services/stripe/v1/charges
                        </code>{" "}
                        — the gateway automatically injects the real API key and forwards to Stripe.
                        No secrets ever reach the agent.
                    </p>
                </CardContent>
            </Card>

            {/* Services Grid */}
            {services.length === 0 ? (
                <Card>
                    <CardContent className="py-16 text-center">
                        <Globe className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                        <h3 className="text-lg font-medium">No services registered</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            Click &quot;Add Service&quot; to register your first external API.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {services.map((svc) => (
                        <Card key={svc.id} className="group relative">
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <Plug className="h-4 w-4 text-blue-500" />
                                        {svc.name}
                                    </CardTitle>
                                    <div className="flex items-center gap-2">
                                        <Badge
                                            variant={svc.service_type === "llm" ? "default" : "secondary"}
                                            className="text-[10px]"
                                        >
                                            {svc.service_type}
                                        </Badge>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                                            onClick={() => handleDelete(svc.id, svc.name)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                                {svc.description && (
                                    <p className="text-xs text-muted-foreground">{svc.description}</p>
                                )}
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Base URL</span>
                                    <span className="font-mono text-xs truncate max-w-[200px]">
                                        {svc.base_url}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Credential</span>
                                    <span className="font-medium">
                                        {getCredentialName(svc.credential_id)}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Created</span>
                                    <span className="text-xs text-muted-foreground">
                                        {formatDistanceToNow(new Date(svc.created_at), {
                                            addSuffix: true,
                                        })}
                                    </span>
                                </div>
                                <div className="pt-2 border-t">
                                    <p className="text-[11px] font-mono text-muted-foreground break-all">
                                        POST /v1/proxy/services/{svc.name}/…
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
