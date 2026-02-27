"use client";

import { useState } from "react";
import useSWR from "swr";
import {
    createService,
    deleteService,
    listCredentials,
    Service,
    Credential,
    McpServerInfo,
    registerMcpServer,
    deleteMcpServer as deleteMcpServerApi,
    refreshMcpServer,
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
import { Plus, Trash2, Plug, Globe, Loader2, RefreshCw, Wrench, Server, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const Select = ({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select
        className={`flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${className || ""}`}
        {...props}
    >
        {children}
    </select>
);

type Tab = "services" | "mcp";

export default function ToolsPage() {
    const [activeTab, setActiveTab] = useState<Tab>("mcp");
    const { data: services = [], mutate: mutateServices, isLoading: servicesLoading } = useSWR<Service[]>("/services", swrFetcher);
    const { data: credentials = [], isLoading: credsLoading } = useSWR<Credential[]>("/credentials", swrFetcher);
    const { data: mcpServers = [], mutate: mutateMcp, isLoading: mcpLoading } = useSWR<McpServerInfo[]>("/mcp/servers", swrFetcher, { refreshInterval: 10000 });

    const loading = servicesLoading || credsLoading || mcpLoading;

    return (
        <div className="space-y-4">
            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-border">
                <button
                    onClick={() => setActiveTab("mcp")}
                    className={cn(
                        "px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                        activeTab === "mcp"
                            ? "text-foreground border-[var(--primary)]"
                            : "text-muted-foreground border-transparent hover:text-foreground"
                    )}
                >
                    <Server className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
                    MCP Servers
                    {mcpServers.length > 0 && (
                        <span className="ml-1.5 text-[10px] font-mono bg-[var(--primary)]/10 text-[var(--primary)] px-1.5 py-0.5 rounded-full">
                            {mcpServers.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab("services")}
                    className={cn(
                        "px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                        activeTab === "services"
                            ? "text-foreground border-[var(--primary)]"
                            : "text-muted-foreground border-transparent hover:text-foreground"
                    )}
                >
                    <Plug className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
                    Services
                    {services.length > 0 && (
                        <span className="ml-1.5 text-[10px] font-mono text-muted-foreground">{services.length}</span>
                    )}
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-32">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : activeTab === "mcp" ? (
                <McpTab servers={mcpServers} mutateMcp={mutateMcp} />
            ) : (
                <ServicesTab
                    services={services}
                    credentials={credentials}
                    mutateServices={mutateServices}
                />
            )}
        </div>
    );
}

// ── MCP Servers Tab ────────────────────────────────────────────

function McpTab({
    servers,
    mutateMcp,
}: {
    servers: McpServerInfo[];
    mutateMcp: () => void;
}) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [name, setName] = useState("");
    const [endpoint, setEndpoint] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [creating, setCreating] = useState(false);
    const [expandedServer, setExpandedServer] = useState<string | null>(null);

    const handleRegister = async () => {
        if (!name || !endpoint) {
            toast.error("Name and endpoint are required");
            return;
        }
        setCreating(true);
        try {
            const result = await registerMcpServer({
                name: name.toLowerCase().replace(/\s+/g, "-"),
                endpoint,
                api_key: apiKey || undefined,
            });
            toast.success(`MCP server "${result.name}" registered — ${result.tool_count} tools discovered`);
            setDialogOpen(false);
            setName("");
            setEndpoint("");
            setApiKey("");
            mutateMcp();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            toast.error(`Failed to register: ${msg}`);
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (id: string, srvName: string) => {
        if (!confirm(`Remove MCP server "${srvName}"? Tools from this server will no longer be available.`)) return;
        try {
            await deleteMcpServerApi(id);
            toast.success(`Removed "${srvName}"`);
            mutateMcp();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            toast.error(`Failed to remove: ${msg}`);
        }
    };

    const handleRefresh = async (id: string, srvName: string) => {
        try {
            const tools = await refreshMcpServer(id);
            toast.success(`Refreshed "${srvName}" — ${tools.length} tools`);
            mutateMcp();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            toast.error(`Failed to refresh: ${msg}`);
        }
    };

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-xs text-muted-foreground">
                        Register MCP servers to auto-discover tools for your AI agents.
                        Use <code className="text-[10px] bg-muted px-1 py-0.5 rounded">X-MCP-Servers: name</code> header to activate.
                    </p>
                </div>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2 ml-4 shrink-0" size="sm">
                            <Plus className="h-3.5 w-3.5" />
                            Add MCP Server
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[480px]">
                        <DialogHeader>
                            <DialogTitle>Register MCP Server</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-2">
                            <div className="space-y-2">
                                <Label htmlFor="mcp-name">Server Name</Label>
                                <Input
                                    id="mcp-name"
                                    placeholder="e.g. brave-search, filesystem, slack"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                                <p className="text-[10px] text-muted-foreground">
                                    Alphanumeric + hyphens. Used in namespacing: <code>mcp__name__tool</code>
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="mcp-endpoint">Endpoint URL</Label>
                                <Input
                                    id="mcp-endpoint"
                                    placeholder="http://localhost:3001/mcp"
                                    value={endpoint}
                                    onChange={(e) => setEndpoint(e.target.value)}
                                />
                                <p className="text-[10px] text-muted-foreground">
                                    Streamable HTTP endpoint (JSON-RPC 2.0 over HTTP POST)
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="mcp-key">API Key <span className="text-muted-foreground">(optional)</span></Label>
                                <Input
                                    id="mcp-key"
                                    type="password"
                                    placeholder="Bearer token for authenticated servers"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                />
                            </div>
                            <Button onClick={handleRegister} disabled={creating} className="w-full">
                                {creating ? (
                                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Connecting…</>
                                ) : (
                                    "Register & Discover Tools"
                                )}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Server List */}
            {servers.length === 0 ? (
                <Card>
                    <CardContent className="py-16 text-center">
                        <Server className="h-10 w-10 mx-auto text-muted-foreground/20 mb-4" />
                        <h3 className="text-base font-medium">No MCP servers registered</h3>
                        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                            Add an MCP server to auto-discover tools. The gateway will inject them into LLM requests and execute tool calls automatically.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-2">
                    {servers.map((srv) => {
                        const isExpanded = expandedServer === srv.id;
                        const isConnected = srv.status === "Connected";
                        return (
                            <Card key={srv.id} className="group">
                                <div
                                    className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-card/80 transition-colors"
                                    onClick={() => setExpandedServer(isExpanded ? null : srv.id)}
                                >
                                    {isExpanded ? (
                                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    ) : (
                                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    )}

                                    <div className={cn(
                                        "h-2 w-2 rounded-full shrink-0",
                                        isConnected ? "bg-emerald-500" : "bg-rose-500"
                                    )} />

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm">{srv.name}</span>
                                            <Badge variant="secondary" className="text-[9px] h-4">
                                                {srv.tool_count} tools
                                            </Badge>
                                            {srv.server_info && (
                                                <span className="text-[10px] text-muted-foreground/50 font-mono">
                                                    {srv.server_info.name} v{srv.server_info.version}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
                                            {srv.endpoint}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            title="Refresh tools"
                                            onClick={() => handleRefresh(srv.id, srv.name)}
                                        >
                                            <RefreshCw className="h-3 w-3" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-destructive"
                                            title="Remove server"
                                            onClick={() => handleDelete(srv.id, srv.name)}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="px-4 pb-3 border-t border-border pt-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Wrench className="h-3 w-3 text-muted-foreground" />
                                            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                                                Discovered Tools
                                            </span>
                                        </div>
                                        {srv.tools.length === 0 ? (
                                            <p className="text-xs text-muted-foreground">No tools discovered</p>
                                        ) : (
                                            <div className="grid gap-1">
                                                {srv.tools.map((tool) => (
                                                    <div
                                                        key={tool}
                                                        className="flex items-center gap-2 py-1 px-2 rounded bg-muted/30 text-xs"
                                                    >
                                                        <span className="font-mono text-[11px] text-foreground/70">
                                                            mcp__{srv.name}__{tool}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <div className="mt-3 pt-2 border-t border-border/40">
                                            <p className="text-[10px] text-muted-foreground">
                                                Usage: <code className="bg-muted px-1 py-0.5 rounded text-[9px]">
                                                    curl -H "X-MCP-Servers: {srv.name}" …
                                                </code>
                                            </p>
                                            <p className="text-[10px] text-muted-foreground/60 mt-1">
                                                Last refreshed {srv.last_refreshed_secs_ago}s ago
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── Services Tab ──────────────────────────────────────────────

function ServicesTab({
    services,
    credentials,
    mutateServices,
}: {
    services: Service[];
    credentials: Credential[];
    mutateServices: any;
}) {
    const [dialogOpen, setDialogOpen] = useState(false);
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
                { optimisticData: [...services, newService], rollbackOnError: true, revalidate: true }
            );
            toast.success(`Service "${name}" registered`);
            setDialogOpen(false);
            setName(""); setDescription(""); setBaseUrl(""); setServiceType("generic"); setCredentialId("");
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            toast.error(`Failed to create service: ${msg}`);
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (id: string, svcName: string) => {
        if (!confirm(`Delete service "${svcName}"?`)) return;
        try {
            await mutateServices(
                async () => {
                    await deleteService(id);
                    return services.filter(s => s.id !== id);
                },
                { optimisticData: services.filter(s => s.id !== id), rollbackOnError: true, revalidate: true }
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

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                    Register external APIs for secure credential-injected proxying.
                </p>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2" size="sm"><Plus className="h-3.5 w-3.5" /> Add Service</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[480px]">
                        <DialogHeader><DialogTitle>Register Service</DialogTitle></DialogHeader>
                        <div className="space-y-4 pt-2">
                            <div className="space-y-2">
                                <Label>Service Name</Label>
                                <Input placeholder="e.g. stripe, slack" value={name} onChange={e => setName(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Description</Label>
                                <Input placeholder="Optional" value={description} onChange={e => setDescription(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Base URL</Label>
                                <Input placeholder="https://api.stripe.com" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Type</Label>
                                <Select value={serviceType} onChange={e => setServiceType(e.target.value)}>
                                    <option value="generic">Generic API</option>
                                    <option value="llm">LLM Provider</option>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Credential</Label>
                                <Select value={credentialId} onChange={e => setCredentialId(e.target.value)}>
                                    <option value="">Select…</option>
                                    {credentials.map(c => (
                                        <option key={c.id} value={c.id}>{c.name} ({c.provider})</option>
                                    ))}
                                </Select>
                            </div>
                            <Button onClick={handleCreate} disabled={creating} className="w-full">
                                {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Registering…</> : "Register Service"}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {services.length === 0 ? (
                <Card>
                    <CardContent className="py-16 text-center">
                        <Globe className="h-10 w-10 mx-auto text-muted-foreground/20 mb-4" />
                        <h3 className="text-base font-medium">No services registered</h3>
                        <p className="text-xs text-muted-foreground mt-1">Click "Add Service" to register an external API.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {services.map((svc) => (
                        <Card key={svc.id} className="group relative">
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm flex items-center gap-1.5">
                                        <Plug className="h-3.5 w-3.5 text-blue-400" />
                                        {svc.name}
                                    </CardTitle>
                                    <div className="flex items-center gap-1">
                                        <Badge variant={svc.service_type === "llm" ? "default" : "secondary"} className="text-[9px] h-4">{svc.service_type}</Badge>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive" onClick={() => handleDelete(svc.id, svc.name)}>
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-1.5 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">URL</span>
                                    <span className="font-mono text-[10px] truncate max-w-[180px]">{svc.base_url}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Credential</span>
                                    <span className="font-medium text-[11px]">{getCredentialName(svc.credential_id)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Created</span>
                                    <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(svc.created_at), { addSuffix: true })}</span>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
