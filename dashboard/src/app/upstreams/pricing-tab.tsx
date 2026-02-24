"use client";

import { useState, useCallback, useEffect } from "react";
import {
    listModelPricing,
    upsertModelPricing,
    deleteModelPricing,
    ModelPricing,
} from "@/lib/api";
import {
    DollarSign,
    Plus,
    Trash2,
    RefreshCw,
    PencilLine,
    Check,
    X,
} from "lucide-react";
import { AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageSkeleton } from "@/components/page-skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PROVIDERS = ["openai", "anthropic", "google", "mistral", "deepseek", "meta", "cohere", "custom"];

const MODELS_BY_PROVIDER: Record<string, string[]> = {
    openai: ["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "o4-mini", "o3", "o3-mini", "o1", "o1-mini", "gpt-3.5-turbo"],
    anthropic: ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229", "claude-3-haiku-20240307"],
    google: ["gemini-2.5-pro-preview-06-05", "gemini-2.5-flash-preview-05-20", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro", "gemini-1.5-flash"],
    mistral: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest", "codestral-latest", "mistral-embed"],
    deepseek: ["deepseek-chat", "deepseek-reasoner"],
    meta: ["llama-4-maverick-17b-128e", "llama-4-scout-17b-16e", "llama-3.3-70b", "llama-3.1-405b", "llama-3.1-70b", "llama-3.1-8b"],
    cohere: ["command-r-plus", "command-r", "command-light"],
    custom: [],
};

const SEED_MODELS = [
    { provider: "openai", model_pattern: "gpt-4.1", input_per_m: 2.00, output_per_m: 8.00 },
    { provider: "openai", model_pattern: "gpt-4.1-mini", input_per_m: 0.40, output_per_m: 1.60 },
    { provider: "openai", model_pattern: "gpt-4.1-nano", input_per_m: 0.10, output_per_m: 0.40 },
    { provider: "openai", model_pattern: "gpt-4o", input_per_m: 2.50, output_per_m: 10.00 },
    { provider: "openai", model_pattern: "gpt-4o-mini", input_per_m: 0.15, output_per_m: 0.60 },
    { provider: "openai", model_pattern: "o4-mini", input_per_m: 1.10, output_per_m: 4.40 },
    { provider: "openai", model_pattern: "o3", input_per_m: 2.00, output_per_m: 8.00 },
    { provider: "openai", model_pattern: "o3-mini", input_per_m: 1.10, output_per_m: 4.40 },
    { provider: "anthropic", model_pattern: "claude-sonnet-4-20250514", input_per_m: 3.00, output_per_m: 15.00 },
    { provider: "anthropic", model_pattern: "claude-opus-4-20250514", input_per_m: 15.00, output_per_m: 75.00 },
    { provider: "anthropic", model_pattern: "claude-3-7-sonnet-20250219", input_per_m: 3.00, output_per_m: 15.00 },
    { provider: "anthropic", model_pattern: "claude-3-5-sonnet-20241022", input_per_m: 3.00, output_per_m: 15.00 },
    { provider: "anthropic", model_pattern: "claude-3-5-haiku-20241022", input_per_m: 0.80, output_per_m: 4.00 },
    { provider: "google", model_pattern: "gemini-2.5-pro-preview-06-05", input_per_m: 1.25, output_per_m: 10.00 },
    { provider: "google", model_pattern: "gemini-2.5-flash-preview-05-20", input_per_m: 0.15, output_per_m: 0.60 },
    { provider: "google", model_pattern: "gemini-2.0-flash", input_per_m: 0.10, output_per_m: 0.40 },
    { provider: "deepseek", model_pattern: "deepseek-chat", input_per_m: 0.27, output_per_m: 1.10 },
    { provider: "deepseek", model_pattern: "deepseek-reasoner", input_per_m: 0.55, output_per_m: 2.19 },
];

interface EditingRow {
    id: string | null;  // null = new row
    provider: string;
    model_pattern: string;
    input_per_m: string;
    output_per_m: string;
}

export default function ModelPricingPage() {
    const [pricing, setPricing] = useState<ModelPricing[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<EditingRow | null>(null);
    const [saving, setSaving] = useState(false);

    const fetchPricing = useCallback(async () => {
        try {
            setLoading(true);
            setPricing(await listModelPricing());
        } catch {
            toast.error("Failed to load model pricing");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchPricing(); }, [fetchPricing]);

    const startNew = () => setEditing({ id: null, provider: "openai", model_pattern: "", input_per_m: "", output_per_m: "" });
    const startEdit = (p: ModelPricing) => setEditing({
        id: p.id,
        provider: p.provider,
        model_pattern: p.model_pattern,
        input_per_m: p.input_per_m.toString(),
        output_per_m: p.output_per_m.toString(),
    });

    const handleSave = async () => {
        if (!editing) return;
        if (!editing.model_pattern.trim()) { toast.error("Model name is required"); return; }
        const inp = parseFloat(editing.input_per_m);
        const out = parseFloat(editing.output_per_m);
        if (isNaN(inp) || isNaN(out)) { toast.error("Invalid price values"); return; }
        try {
            setSaving(true);
            await upsertModelPricing({
                provider: editing.provider,
                model_pattern: editing.model_pattern.trim(),
                input_per_m: inp,
                output_per_m: out
            });
            toast.success("Model pricing saved");
            setEditing(null);
            fetchPricing();
        } catch {
            toast.error("Failed to save pricing");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (p: ModelPricing) => {
        try {
            await deleteModelPricing(p.id);
            setPricing((prev) => prev.filter((x) => x.id !== p.id));
            toast.success(`Pricing for "${p.model_pattern}" removed`);
        } catch {
            toast.error("Failed to delete pricing");
        }
    };

    const handleSeedAll = async () => {
        try {
            await Promise.all(SEED_MODELS.map((m) => upsertModelPricing(m)));
            toast.success("Seeded 5 default models");
            fetchPricing();
        } catch {
            toast.error("Failed to seed pricing");
        }
    };

    if (loading) return <PageSkeleton />;

    // Group by provider
    const grouped: Record<string, ModelPricing[]> = {};
    for (const p of pricing) {
        if (!grouped[p.provider]) grouped[p.provider] = [];
        grouped[p.provider].push(p);
    }

    return (
        <div className="space-y-6 pt-2 animate-fade-in max-w-[1400px]">
            {/* Header */}
            <div className="flex items-center justify-between animate-fade-in">
                <div className="space-y-1">
                    <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
                            <DollarSign className="h-5 w-5 text-white" />
                        </div>
                        Model Pricing
                    </h2>
                    <p className="text-muted-foreground text-sm">
                        Override per-model input/output pricing (USD per 1M tokens) for accurate cost accounting.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fetchPricing}>
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
                    </Button>
                    {pricing.length === 0 && (
                        <Button variant="outline" size="sm" onClick={handleSeedAll}>
                            Seed Defaults
                        </Button>
                    )}
                    <Button size="sm" onClick={startNew}>
                        <Plus className="h-4 w-4 mr-1.5" /> Add Model
                    </Button>
                </div>
            </div>

            {/* Inline Edit Form */}
            {editing && (
                <Card className="border-primary/30 bg-primary/5 animate-fade-in">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">{editing.id ? "Edit Pricing" : "Add Model Pricing"}</CardTitle>
                        <CardDescription>Prices are in USD per 1 million tokens.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Provider</label>
                                <select
                                    value={editing.provider}
                                    onChange={(e) => setEditing({ ...editing, provider: e.target.value })}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                                >
                                    {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Model ID</label>
                                {(MODELS_BY_PROVIDER[editing.provider] || []).length > 0 ? (
                                    <>
                                        <select
                                            value={(MODELS_BY_PROVIDER[editing.provider] || []).includes(editing.model_pattern) ? editing.model_pattern : "__custom__"}
                                            onChange={(e) => {
                                                if (e.target.value !== "__custom__") {
                                                    setEditing({ ...editing, model_pattern: e.target.value });
                                                }
                                            }}
                                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                                        >
                                            {MODELS_BY_PROVIDER[editing.provider].map((m) => (
                                                <option key={m} value={m}>{m}</option>
                                            ))}
                                            <option value="__custom__">Custom model ID…</option>
                                        </select>
                                        {!(MODELS_BY_PROVIDER[editing.provider] || []).includes(editing.model_pattern) && (
                                            <input
                                                type="text"
                                                placeholder="Type a custom model ID"
                                                value={editing.model_pattern}
                                                onChange={(e) => setEditing({ ...editing, model_pattern: e.target.value })}
                                                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                                            />
                                        )}
                                    </>
                                ) : (
                                    <input
                                        type="text"
                                        placeholder="model-name"
                                        value={editing.model_pattern}
                                        onChange={(e) => setEditing({ ...editing, model_pattern: e.target.value })}
                                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                                    />
                                )}
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Input ($/1M tokens)</label>
                                <input
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    placeholder="0.15"
                                    value={editing.input_per_m}
                                    onChange={(e) => setEditing({ ...editing, input_per_m: e.target.value })}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Output ($/1M tokens)</label>
                                <input
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    placeholder="0.60"
                                    value={editing.output_per_m}
                                    onChange={(e) => setEditing({ ...editing, output_per_m: e.target.value })}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-4">
                            <Button size="sm" onClick={handleSave} disabled={saving}>
                                {saving ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                                Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                                <X className="h-3.5 w-3.5 mr-1.5" /> Cancel
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Empty State */}
            {pricing.length === 0 && !editing && (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                            <DollarSign className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium">No custom model pricing defined</p>
                        <p className="text-xs text-muted-foreground text-center max-w-xs">
                            The gateway uses built-in defaults. Override pricing here for accurate cost tracking.
                        </p>
                        <div className="flex gap-2 mt-2">
                            <Button size="sm" onClick={handleSeedAll} variant="outline">Seed Defaults</Button>
                            <Button size="sm" onClick={startNew}><Plus className="h-4 w-4 mr-1.5" /> Add Model</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Pricing Table grouped by provider */}
            {Object.entries(grouped).map(([provider, models]) => (
                <div key={provider} className="animate-fade-in">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 ml-1 capitalize">{provider}</h3>
                    <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden shadow-sm">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border/60 text-left text-muted-foreground bg-muted/20">
                                    <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider">Model</th>
                                    <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider text-right">Input $/1M</th>
                                    <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider text-right">Output $/1M</th>
                                    <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider text-right">Updated</th>
                                    <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                                {models.map((p) => (
                                    <tr key={p.id} className="hover:bg-muted/30 transition-colors group">
                                        <td className="px-6 py-4 font-mono text-sm">{p.model_pattern}</td>
                                        <td className="px-6 py-4 text-right font-mono text-amber-400">
                                            ${typeof p.input_per_m === 'number' ? p.input_per_m.toFixed(3) : parseFloat(p.input_per_m || "0").toFixed(3)}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-amber-400">
                                            ${typeof p.output_per_m === 'number' ? p.output_per_m.toFixed(3) : parseFloat(p.output_per_m || "0").toFixed(3)}
                                        </td>
                                        <td className="px-6 py-4 text-right text-xs text-muted-foreground">
                                            {new Date(p.updated_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 w-7 p-0"
                                                    title="Edit"
                                                    onClick={() => startEdit(p)}
                                                >
                                                    <PencilLine className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
                                                    title="Delete"
                                                    onClick={() => handleDelete(p)}
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
                </div>
            ))}
            {/* Alias Billing Info Card */}
            <Card className="border-border/40 bg-muted/20">
                <CardContent className="py-4 px-5">
                    <div className="flex gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 flex-shrink-0 mt-0.5">
                            <Info className="h-4 w-4 text-emerald-500" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-medium">Model Aliases & Billing</p>
                            <p className="text-xs text-muted-foreground">
                                Pricing is always based on the <strong>real model ID</strong> returned by the upstream provider — not the alias.
                                If an agent sends <code className="font-mono bg-muted px-1 rounded">model: &quot;fast&quot;</code> and
                                the alias maps to <code className="font-mono bg-muted px-1 rounded">gpt-4.1-mini</code>,
                                cost is calculated using the <code className="font-mono bg-muted px-1 rounded">gpt-4.1-mini</code> pricing row.
                                Always add pricing for the <strong>real model ID</strong>, not the alias name.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
