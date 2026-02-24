"use client";

import { useState, useCallback, useEffect } from "react";
import {
    listModelAliases,
    createModelAlias,
    deleteModelAlias,
    ModelAlias,
} from "@/lib/api";
import {
    Map,
    Plus,
    Trash2,
    RefreshCw,
    ArrowRight,
    Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageSkeleton } from "@/components/page-skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PROVIDERS = [
    {
        label: "OpenAI", models: [
            "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano",
            "gpt-4o", "gpt-4o-mini",
            "gpt-4-turbo", "gpt-4",
            "o4-mini", "o3", "o3-mini", "o1", "o1-mini",
            "gpt-3.5-turbo",
        ]
    },
    {
        label: "Anthropic", models: [
            "claude-sonnet-4-20250514", "claude-opus-4-20250514",
            "claude-3-7-sonnet-20250219",
            "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022",
            "claude-3-opus-20240229", "claude-3-haiku-20240307",
        ]
    },
    {
        label: "Google", models: [
            "gemini-2.5-pro-preview-06-05", "gemini-2.5-flash-preview-05-20",
            "gemini-2.0-flash", "gemini-2.0-flash-lite",
            "gemini-1.5-pro", "gemini-1.5-flash",
        ]
    },
    {
        label: "Mistral", models: [
            "mistral-large-latest", "mistral-medium-latest", "mistral-small-latest",
            "codestral-latest", "mistral-embed",
        ]
    },
    {
        label: "Meta (via providers)", models: [
            "llama-4-maverick-17b-128e", "llama-4-scout-17b-16e",
            "llama-3.3-70b", "llama-3.1-405b", "llama-3.1-70b", "llama-3.1-8b",
        ]
    },
    {
        label: "DeepSeek", models: [
            "deepseek-chat", "deepseek-reasoner",
        ]
    },
    {
        label: "Cohere", models: [
            "command-r-plus", "command-r", "command-light",
        ]
    },
];

const ALL_MODELS = PROVIDERS.flatMap((p) => p.models);

export default function ModelAliasesPage() {
    const [aliases, setAliases] = useState<ModelAlias[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [alias, setAlias] = useState("");
    const [model, setModel] = useState("gpt-4o");
    const [customModel, setCustomModel] = useState("");
    const [saving, setSaving] = useState(false);

    const fetchAliases = useCallback(async () => {
        try {
            setLoading(true);
            setAliases(await listModelAliases());
        } catch {
            toast.error("Failed to load model aliases");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAliases(); }, [fetchAliases]);

    const handleCreate = async () => {
        const targetModel = customModel.trim() || model;
        if (!alias.trim()) { toast.error("Alias name is required"); return; }
        if (!targetModel) { toast.error("Target model is required"); return; }
        if (alias.trim() === targetModel) { toast.error("Alias must differ from target model"); return; }
        try {
            setSaving(true);
            await createModelAlias(alias.trim(), targetModel);
            toast.success(`Alias "${alias.trim()}" → "${targetModel}" created`);
            setAlias("");
            setCustomModel("");
            setShowAdd(false);
            fetchAliases();
        } catch (e: any) {
            toast.error(e?.message?.includes("409") ? "An alias with this name already exists" : "Failed to create alias");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (a: ModelAlias) => {
        try {
            await deleteModelAlias(a.alias);
            setAliases((prev) => prev.filter((x) => x.alias !== a.alias));
            toast.success(`Alias "${a.alias}" removed`);
        } catch {
            toast.error("Failed to delete alias");
        }
    };

    if (loading) return <PageSkeleton />;

    return (
        <div className="space-y-6 pt-2 animate-fade-in max-w-[1200px]">
            {/* Header */}
            <div className="flex items-center justify-between animate-fade-in">
                <div className="space-y-1">
                    <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/20">
                            <Map className="h-5 w-5 text-white" />
                        </div>
                        Model Aliases
                    </h2>
                    <p className="text-muted-foreground text-sm">
                        Map short logical names to real model identifiers. Agents use the alias; you control the routing.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fetchAliases}>
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
                    </Button>
                    <Button size="sm" onClick={() => setShowAdd((v) => !v)}>
                        <Plus className="h-4 w-4 mr-1.5" /> New Alias
                    </Button>
                </div>
            </div>

            {/* Add Alias Form */}
            {showAdd && (
                <Card className="border-primary/30 bg-primary/5 animate-fade-in">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Create Model Alias</CardTitle>
                        <CardDescription>
                            Agents request the alias name; the gateway transparently routes to the target model.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                                    Alias Name <span className="text-muted-foreground/60">(what agents will use)</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="fast, smart, cheap, premium…"
                                    value={alias}
                                    onChange={(e) => setAlias(e.target.value)}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                                    Target Model <span className="text-muted-foreground/60">(or type a custom ID)</span>
                                </label>
                                <select
                                    value={model}
                                    onChange={(e) => { setModel(e.target.value); setCustomModel(""); }}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                                >
                                    {PROVIDERS.map((p) => (
                                        <optgroup key={p.label} label={p.label}>
                                            {p.models.map((m) => (
                                                <option key={m} value={m}>{m}</option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                                <input
                                    type="text"
                                    placeholder="Or type a custom model ID…"
                                    value={customModel}
                                    onChange={(e) => setCustomModel(e.target.value)}
                                    className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                                />
                            </div>
                        </div>

                        {/* Preview */}
                        {alias && (
                            <div className="flex items-center gap-3 bg-muted/40 rounded-lg px-4 py-2.5 text-sm">
                                <code className="font-mono text-primary font-semibold">{alias}</code>
                                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                <code className="font-mono text-foreground">{customModel.trim() || model}</code>
                            </div>
                        )}

                        <div className="flex gap-2 pt-1">
                            <Button size="sm" onClick={handleCreate} disabled={saving}>
                                {saving ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                                Create Alias
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Quick-create templates */}
            {aliases.length === 0 && !showAdd && (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                            <Map className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium">No model aliases configured</p>
                        <p className="text-xs text-muted-foreground text-center max-w-xs">
                            Create aliases to decouple agents from specific models. Swap providers without touching agent code.
                        </p>
                        <div className="flex flex-wrap gap-2 justify-center mt-2">
                            {[
                                { alias: "fast", model: "gpt-4.1-mini" },
                                { alias: "smart", model: "claude-sonnet-4-20250514" },
                                { alias: "cheap", model: "gemini-2.0-flash" },
                                { alias: "premium", model: "gpt-4.1" },
                                { alias: "reasoning", model: "o3" },
                            ].map((t) => (
                                <Button
                                    key={t.alias}
                                    size="sm"
                                    variant="outline"
                                    className="text-xs h-7"
                                    onClick={async () => {
                                        try {
                                            await createModelAlias(t.alias, t.model);
                                            toast.success(`"${t.alias}" → "${t.model}" created`);
                                            fetchAliases();
                                        } catch {
                                            toast.error("Failed to create alias");
                                        }
                                    }}
                                >
                                    {t.alias} → {t.model}
                                </Button>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Aliases Table */}
            {aliases.length > 0 && (
                <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden shadow-sm animate-fade-in">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border/60 text-left text-muted-foreground bg-muted/20">
                                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider">Alias</th>
                                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider"></th>
                                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider">Target Model</th>
                                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider">Created</th>
                                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                            {aliases.map((a) => (
                                <tr key={a.alias} className="hover:bg-muted/30 transition-colors group">
                                    <td className="px-6 py-4">
                                        <code className="font-mono text-sm font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                                            {a.alias}
                                        </code>
                                    </td>
                                    <td className="px-2 py-4 text-muted-foreground">
                                        <ArrowRight className="h-4 w-4" />
                                    </td>
                                    <td className="px-6 py-4 font-mono text-sm text-foreground/80">{a.model}</td>
                                    <td className="px-6 py-4 text-xs text-muted-foreground">
                                        {new Date(a.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 p-0"
                                                title="Copy alias name"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(a.alias);
                                                    toast.success("Copied alias name");
                                                }}
                                            >
                                                <Copy className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
                                                title="Delete alias"
                                                onClick={() => handleDelete(a)}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Info Card */}
            <Card className="border-border/40 bg-muted/20">
                <CardContent className="py-4 px-5">
                    <div className="flex gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 flex-shrink-0 mt-0.5">
                            <Map className="h-4 w-4 text-blue-500" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-medium">How Model Aliases Work</p>
                            <p className="text-xs text-muted-foreground">
                                When an agent sends <code className="font-mono bg-muted px-1 rounded">{"model: \"fast\""}</code>,
                                the gateway transparently rewrites the request to use the target model before forwarding to the upstream.
                                Agents never see the real model name — so you can swap providers or upgrade models without any agent code changes.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
