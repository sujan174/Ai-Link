"use client";

import { useState, useEffect, useCallback } from "react";
import { listPolicies, createPolicy, updatePolicy, deletePolicy, Policy } from "@/lib/api";
import {
    RefreshCw, Plus, ShieldCheck, ShieldAlert, Eye, X,
    ChevronRight, ShieldBan, Zap, Clock, FileText, Code2,
    AlertTriangle, Check, Copy, Layers, Filter, Tag
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { columns } from "./columns";
import { PolicyHistoryDialog } from "@/components/policy-history";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogClose
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";

// ── Constants ─────────────────────────────────────

const OPERATORS = [
    { value: "Eq", label: "equals" },
    { value: "Neq", label: "not equals" },
    { value: "Gt", label: ">" },
    { value: "Gte", label: ">=" },
    { value: "Lt", label: "<" },
    { value: "Lte", label: "<=" },
    { value: "Contains", label: "contains" },
    { value: "StartsWith", label: "starts with" },
    { value: "EndsWith", label: "ends with" },
    { value: "Regex", label: "matches regex" },
    { value: "In", label: "in list" },
    { value: "Exists", label: "exists" },
];

const FIELD_SUGGESTIONS = [
    { group: "Request", fields: ["request.method", "request.path", "request.body_size", "request.header.content-type"] },
    { group: "Agent", fields: ["agent.name"] },
    { group: "Token", fields: ["token.id", "token.name"] },
    { group: "Usage", fields: ["usage.spend_today_usd", "usage.spend_month_usd"] },
    { group: "Response", fields: ["response.status", "response.body.error"] },
    { group: "Context", fields: ["context.time.hour", "context.time.weekday", "context.ip"] },
];

const ACTION_TYPES = [
    { value: "Deny", label: "Deny", icon: ShieldBan, color: "text-rose-400", desc: "Block the request" },
    { value: "RequireApproval", label: "HITL Approval", icon: ShieldCheck, color: "text-amber-400", desc: "Require human approval" },
    { value: "RateLimit", label: "Rate Limit", icon: Zap, color: "text-blue-400", desc: "Limit request rate" },
    { value: "Redact", label: "Redact PII", icon: ShieldAlert, color: "text-violet-400", desc: "Scrub sensitive data" },
    { value: "Transform", label: "Transform", icon: FileText, color: "text-cyan-400", desc: "Modify request/response" },
    { value: "Log", label: "Log", icon: FileText, color: "text-emerald-400", desc: "Log event" },
    { value: "Throttle", label: "Throttle", icon: Clock, color: "text-orange-400", desc: "Add delay" },
    { value: "Tag", label: "Tag", icon: Tag, color: "text-pink-400", desc: "Add metadata tag" },
];

// ── Main Page ─────────────────────────────────────

export default function PoliciesPage() {
    const [policies, setPolicies] = useState<Policy[]>([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [detailPolicy, setDetailPolicy] = useState<Policy | null>(null);
    const [editPolicy, setEditPolicy] = useState<Policy | null>(null);
    const [historyPolicy, setHistoryPolicy] = useState<Policy | null>(null);

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
    const totalRules = policies.reduce((sum, p) => sum + (p.rules?.length || 0), 0);

    return (
        <div className="p-8 space-y-6 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between animate-fade-in">
                <div className="space-y-1">
                    <h2 className="text-3xl font-bold tracking-tight">Policy Engine</h2>
                    <p className="text-muted-foreground text-sm">Condition → action rules for traffic governance, AI safety, and compliance</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fetchPolicies} disabled={loading}>
                        <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
                        Refresh
                    </Button>
                    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm">
                                <Plus className="mr-1.5 h-3.5 w-3.5" /> New Policy
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[680px] max-h-[85vh] overflow-y-auto">
                            <PolicyFormDialog
                                mode="create"
                                onSuccess={() => { setCreateOpen(false); fetchPolicies(); }}
                            />
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* KPI Strip */}
            <div className="grid gap-3 md:grid-cols-4 animate-slide-up">
                <KPIMini icon={Layers} value={policies.length} label="Total Policies" color="blue" />
                <KPIMini icon={ShieldBan} value={blockingCount} label="Blocking" color="rose" />
                <KPIMini icon={Eye} value={shadowCount} label="Shadow Mode" color="amber" />
                <KPIMini icon={Filter} value={totalRules} label="Total Rules" color="violet" />
            </div>

            {/* Table */}
            <div className="animate-slide-up stagger-2">
                <DataTable
                    columns={columns}
                    data={policies}
                    searchKey="name"
                    searchPlaceholder="Search policies..."
                    meta={{
                        onView: (p: Policy) => setDetailPolicy(p),
                        onEdit: (p: Policy) => setEditPolicy(p),
                        onRefresh: fetchPolicies,
                    }}
                />
            </div>

            {/* Detail Panel */}
            {detailPolicy && (
                <PolicyDetailPanel
                    policy={detailPolicy}
                    onClose={() => setDetailPolicy(null)}
                    onEdit={() => { setEditPolicy(detailPolicy); setDetailPolicy(null); }}
                    onHistory={() => setHistoryPolicy(detailPolicy)}
                />
            )}

            {/* Edit Dialog */}
            {editPolicy && (
                <Dialog open={!!editPolicy} onOpenChange={(open) => !open && setEditPolicy(null)}>
                    <DialogContent className="sm:max-w-[680px] max-h-[85vh] overflow-y-auto">
                        <PolicyFormDialog
                            mode="edit"
                            initialPolicy={editPolicy}
                            onSuccess={() => { setEditPolicy(null); fetchPolicies(); }}
                        />
                    </DialogContent>
                </Dialog>
            )}

            {/* History Dialog */}
            {historyPolicy && (
                <PolicyHistoryDialog
                    policyId={historyPolicy.id}
                    open={!!historyPolicy}
                    onOpenChange={(open) => !open && setHistoryPolicy(null)}
                />
            )}
        </div>
    );
}

// ── KPI Mini Card ─────────────────────────────────

function KPIMini({ icon: Icon, value, label, color }: {
    icon: React.ComponentType<{ className?: string }>;
    value: number;
    label: string;
    color: "blue" | "rose" | "amber" | "violet";
}) {
    const colors = {
        blue: "icon-circle-blue",
        rose: "bg-rose-500/10 text-rose-500",
        amber: "icon-circle-amber",
        violet: "icon-circle-violet",
    };
    return (
        <Card className="glass-card hover-lift p-3">
            <div className="flex items-center gap-3">
                <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", colors[color])}>
                    <Icon className="h-3.5 w-3.5" />
                </div>
                <div>
                    <p className="text-xl font-bold tabular-nums">{value}</p>
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                </div>
            </div>
        </Card>
    );
}

// ── Policy Detail Panel (Slide-over) ──────────────

function PolicyDetailPanel({ policy, onClose, onEdit, onHistory }: {
    policy: Policy;
    onClose: () => void;
    onEdit: () => void;
    onHistory: () => void;
}) {
    return (
        <div className="fixed inset-y-0 right-0 w-[480px] z-50 bg-card/95 backdrop-blur-xl border-l border-border shadow-2xl flex flex-col animate-slide-in-right">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
                        <ShieldAlert className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-semibold text-sm truncate">{policy.name}</h3>
                        <p className="text-[11px] text-muted-foreground font-mono truncate">{policy.id}</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                        navigator.clipboard.writeText(policy.id);
                        toast.success("Copied");
                    }}>
                        <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onHistory} title="View History">
                        <Clock className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Meta */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Mode</p>
                        <Badge variant={policy.mode === "blocking" ? "destructive" : "warning"} dot className="capitalize">
                            {policy.mode}
                        </Badge>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Status</p>
                        <Badge variant={policy.is_active ? "success" : "secondary"} dot>
                            {policy.is_active ? "Active" : "Disabled"}
                        </Badge>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Created</p>
                        <p className="text-sm font-mono">{formatDistanceToNow(new Date(policy.created_at), { addSuffix: true })}</p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Rules</p>
                        <p className="text-sm font-mono">{policy.rules?.length || 0}</p>
                    </div>
                </div>

                {/* Rules */}
                <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-3">Rules</p>
                    <div className="space-y-3">
                        {(policy.rules || []).map((rule, idx) => (
                            <RuleCard key={idx} rule={rule as Record<string, unknown>} index={idx} />
                        ))}
                        {(!policy.rules || policy.rules.length === 0) && (
                            <div className="text-center py-8 text-muted-foreground">
                                <Filter className="h-6 w-6 mx-auto mb-2 opacity-30" />
                                <p className="text-xs">No rules defined</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Raw JSON */}
                <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">Raw Definition</p>
                    <pre className="bg-muted/30 rounded-lg p-3 text-[11px] font-mono text-muted-foreground overflow-x-auto max-h-[200px]">
                        {JSON.stringify(policy.rules, null, 2)}
                    </pre>
                </div>
            </div>

            {/* Footer */}
            <div className="border-t border-border px-6 py-3 flex items-center gap-2">
                <Button size="sm" className="flex-1" onClick={onEdit}>
                    Edit Policy
                </Button>
                <Button size="sm" variant="outline" onClick={onClose}>
                    Close
                </Button>
            </div>
        </div >
    );
}

// ── Rule Card (inside detail panel) ───────────────

function RuleCard({ rule, index }: { rule: Record<string, unknown>; index: number }) {
    const condition = rule.condition as Record<string, unknown> | undefined;
    const action = rule.action as Record<string, unknown> | undefined;

    // Legacy format detection
    if (rule.type) {
        return (
            <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                        #{index + 1}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">{rule.type as string}</Badge>
                </div>
                <pre className="text-[11px] font-mono text-muted-foreground">{JSON.stringify(rule, null, 2)}</pre>
            </div>
        );
    }

    const actionType = action ? Object.keys(action)[0] : "unknown";
    const at = ACTION_TYPES.find(a => a.value === actionType);

    return (
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                        #{index + 1}
                    </span>
                    {at && <at.icon className={cn("h-3.5 w-3.5", at.color)} />}
                    <span className="text-xs font-medium">{at?.label || actionType}</span>
                </div>
                {Boolean(rule.phase) && (
                    <Badge variant="outline" className="text-[10px]">{String(rule.phase)}</Badge>
                )}
            </div>

            {/* Condition */}
            {condition && (
                <div className="flex items-start gap-2">
                    <span className="text-[10px] uppercase text-muted-foreground font-semibold mt-0.5 shrink-0 w-8">IF</span>
                    <pre className="text-[11px] font-mono text-muted-foreground bg-muted/30 rounded px-2 py-1 flex-1 overflow-x-auto">
                        {JSON.stringify(condition, null, 1)}
                    </pre>
                </div>
            )}

            {/* Action */}
            {action && (
                <div className="flex items-start gap-2">
                    <span className="text-[10px] uppercase text-muted-foreground font-semibold mt-0.5 shrink-0 w-8">DO</span>
                    <pre className="text-[11px] font-mono text-muted-foreground bg-muted/30 rounded px-2 py-1 flex-1 overflow-x-auto">
                        {JSON.stringify(action, null, 1)}
                    </pre>
                </div>
            )}
        </div>
    );
}

// ── Policy Form (Create / Edit) ───────────────────

interface RuleForm {
    conditionMode: "always" | "check";
    field: string;
    operator: string;
    value: string;
    actionType: string;
    // Deny
    denyMessage: string;
    denyStatus: number;
    // RateLimit
    rateMax: number;
    rateWindow: string;
    rateKey: string;
    // Redact
    redactDirection: string;
    redactPatterns: string;
    redactFields: string;
    // HITL
    hitlTimeout: number;
    // Throttle
    throttleMs: number;
    // Log
    logLevel: string;
    logTags: string;
    // Tag
    tagKey: string;
    tagValue: string;
    // Transform
    transformOps: string;
    // Phase
    phase: string;
}

function emptyRule(): RuleForm {
    return {
        conditionMode: "always",
        field: "",
        operator: "Gt",
        value: "",
        actionType: "Deny",
        denyMessage: "Request blocked by policy",
        denyStatus: 403,
        rateMax: 100,
        rateWindow: "60s",
        rateKey: "token",
        redactDirection: "Request",
        redactPatterns: "email,ssn",
        redactFields: "",
        hitlTimeout: 300,
        throttleMs: 2000,
        logLevel: "info",
        logTags: "",
        tagKey: "",
        tagValue: "",
        transformOps: "",
        phase: "pre",
    };
}

function PolicyFormDialog({ mode, initialPolicy, onSuccess }: {
    mode: "create" | "edit";
    initialPolicy?: Policy;
    onSuccess: () => void;
}) {
    const [saving, setSaving] = useState(false);
    const [name, setName] = useState(initialPolicy?.name || "");
    const [policyMode, setPolicyMode] = useState(initialPolicy?.mode || "blocking");
    const [inputMode, setInputMode] = useState<"visual" | "json">("visual");
    const [rules, setRules] = useState<RuleForm[]>([emptyRule()]);
    const [jsonRules, setJsonRules] = useState("[]");

    useEffect(() => {
        if (initialPolicy?.rules) {
            setJsonRules(JSON.stringify(initialPolicy.rules, null, 2));
        }
    }, [initialPolicy]);

    const addRule = () => setRules([...rules, emptyRule()]);
    const removeRule = (idx: number) => setRules(rules.filter((_, i) => i !== idx));

    const updateRule = (idx: number, updates: Partial<RuleForm>) => {
        setRules(rules.map((r, i) => i === idx ? { ...r, ...updates } : r));
    };

    function buildCondition(rule: RuleForm) {
        if (rule.conditionMode === "always") return { Always: true };
        return {
            Check: {
                field: rule.field,
                operator: rule.operator,
                value: rule.value,
            }
        };
    }

    function buildAction(rule: RuleForm) {
        switch (rule.actionType) {
            case "Deny":
                return { Deny: { status: rule.denyStatus, message: rule.denyMessage } };
            case "RateLimit":
                return { RateLimit: { max: rule.rateMax, window: rule.rateWindow, key: rule.rateKey } };
            case "Redact":
                return {
                    Redact: {
                        direction: rule.redactDirection,
                        patterns: rule.redactPatterns.split(",").map(s => s.trim()).filter(Boolean),
                        fields: rule.redactFields.split(",").map(s => s.trim()).filter(Boolean),
                    }
                };
            case "RequireApproval":
                return { RequireApproval: { timeout_secs: rule.hitlTimeout } };
            case "Throttle":
                return { Throttle: { delay_ms: rule.throttleMs } };
            case "Log":
                return {
                    Log: {
                        level: rule.logLevel,
                        tags: rule.logTags.split(",").map(s => s.trim()).filter(Boolean),
                    }
                };
            case "Tag":
                return { Tag: { key: rule.tagKey, value: rule.tagValue } };
            case "Transform":
                try { return { Transform: { operations: JSON.parse(rule.transformOps || "[]") } }; }
                catch { return { Transform: { operations: [] } }; }
            default:
                return { Deny: { status: 403, message: "Unknown action" } };
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSaving(true);
            let finalRules;
            if (inputMode === "json") {
                finalRules = JSON.parse(jsonRules);
            } else {
                finalRules = rules.map(r => ({
                    condition: buildCondition(r),
                    action: buildAction(r),
                    phase: r.phase,
                }));
            }

            if (mode === "edit" && initialPolicy) {
                await updatePolicy(initialPolicy.id, { name, mode: policyMode, rules: finalRules });
                toast.success("Policy updated");
            } else {
                await createPolicy({ name, mode: policyMode, rules: finalRules });
                toast.success("Policy created");
            }
            onSuccess();
        } catch (err) {
            toast.error(mode === "edit" ? "Failed to update policy" : "Failed to create policy");
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <DialogHeader>
                <DialogTitle>{mode === "edit" ? "Edit Policy" : "Create Policy"}</DialogTitle>
                <DialogDescription>
                    {mode === "edit"
                        ? "Modify the rules and configuration for this policy."
                        : "Define condition → action rules for traffic control and AI safety."}
                </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-4">
                {/* Name + Mode */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="name" className="text-xs">Policy Name</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. PII Protection"
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="mode" className="text-xs">Mode</Label>
                        <Select value={policyMode} onChange={(e) => setPolicyMode(e.target.value)}>
                            <option value="blocking">🔒 Blocking (Enforce)</option>
                            <option value="shadow">👁 Shadow (Log only)</option>
                        </Select>
                    </div>
                </div>

                {/* Input Mode Toggle */}
                <div className="flex items-center gap-1 border rounded-lg p-0.5 w-fit">
                    <button
                        type="button"
                        className={cn(
                            "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                            inputMode === "visual" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        )}
                        onClick={() => setInputMode("visual")}
                    >
                        <Layers className="h-3 w-3 inline mr-1.5" /> Visual Builder
                    </button>
                    <button
                        type="button"
                        className={cn(
                            "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                            inputMode === "json" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        )}
                        onClick={() => setInputMode("json")}
                    >
                        <Code2 className="h-3 w-3 inline mr-1.5" /> JSON
                    </button>
                </div>

                {inputMode === "visual" ? (
                    <div className="space-y-3">
                        {rules.map((rule, idx) => (
                            <VisualRuleEditor
                                key={idx}
                                rule={rule}
                                index={idx}
                                total={rules.length}
                                onUpdate={(updates) => updateRule(idx, updates)}
                                onRemove={() => removeRule(idx)}
                            />
                        ))}
                        <Button type="button" variant="outline" size="sm" className="w-full" onClick={addRule}>
                            <Plus className="h-3 w-3 mr-1.5" /> Add Rule
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        <Label className="text-xs">Rules JSON</Label>
                        <textarea
                            className="flex min-h-[200px] w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-xs font-mono ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
                            value={jsonRules}
                            onChange={(e) => setJsonRules(e.target.value)}
                        />
                    </div>
                )}
            </div>

            <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="outline" size="sm">Cancel</Button>
                </DialogClose>
                <Button type="submit" size="sm" disabled={saving}>
                    {saving ? "Saving..." : mode === "edit" ? "Update Policy" : "Create Policy"}
                </Button>
            </DialogFooter>
        </form>
    );
}

// ── Visual Rule Editor ────────────────────────────

function VisualRuleEditor({ rule, index, total, onUpdate, onRemove }: {
    rule: RuleForm;
    index: number;
    total: number;
    onUpdate: (updates: Partial<RuleForm>) => void;
    onRemove: () => void;
}) {
    const at = ACTION_TYPES.find(a => a.value === rule.actionType);

    return (
        <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                        Rule #{index + 1}
                    </span>
                    <Select value={rule.phase} onChange={(e) => onUpdate({ phase: e.target.value })} className="h-7 w-20 text-[11px]">
                        <option value="pre">Pre</option>
                        <option value="post">Post</option>
                    </Select>
                </div>
                {total > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={onRemove}>
                        <X className="h-3 w-3" />
                    </Button>
                )}
            </div>

            {/* Condition */}
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-semibold text-amber-400 w-8">IF</span>
                    <Select value={rule.conditionMode} onChange={(e) => onUpdate({ conditionMode: e.target.value as "always" | "check" })} className="h-7 w-32 text-[11px]">
                        <option value="always">Always</option>
                        <option value="check">Condition...</option>
                    </Select>
                </div>
                {rule.conditionMode === "check" && (
                    <div className="ml-10 grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                            <Input
                                value={rule.field}
                                onChange={(e) => onUpdate({ field: e.target.value })}
                                placeholder="request.path"
                                className="h-7 text-[11px] font-mono"
                                list={`fields-${index}`}
                            />
                            <datalist id={`fields-${index}`}>
                                {FIELD_SUGGESTIONS.flatMap(g => g.fields.map(f => (
                                    <option key={f} value={f} />
                                )))}
                            </datalist>
                        </div>
                        <Select value={rule.operator} onChange={(e) => onUpdate({ operator: e.target.value })} className="h-7 text-[11px]">
                            {OPERATORS.map(op => (
                                <option key={op.value} value={op.value}>{op.label}</option>
                            ))}
                        </Select>
                        <Input
                            value={rule.value}
                            onChange={(e) => onUpdate({ value: e.target.value })}
                            placeholder="value"
                            className="h-7 text-[11px] font-mono"
                        />
                    </div>
                )}
            </div>

            {/* Action */}
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-semibold text-emerald-400 w-8">DO</span>
                    <Select value={rule.actionType} onChange={(e) => onUpdate({ actionType: e.target.value })} className="h-7 text-[11px]">
                        {ACTION_TYPES.map(a => (
                            <option key={a.value} value={a.value}>{a.label} — {a.desc}</option>
                        ))}
                    </Select>
                </div>

                {/* Action-specific fields */}
                <div className="ml-10 space-y-2">
                    {rule.actionType === "Deny" && (
                        <div className="grid grid-cols-4 gap-2">
                            <Input
                                type="number"
                                value={rule.denyStatus}
                                onChange={(e) => onUpdate({ denyStatus: parseInt(e.target.value) })}
                                className="h-7 text-[11px] font-mono"
                                placeholder="403"
                            />
                            <Input
                                value={rule.denyMessage}
                                onChange={(e) => onUpdate({ denyMessage: e.target.value })}
                                className="h-7 text-[11px] col-span-3"
                                placeholder="Denial message"
                            />
                        </div>
                    )}
                    {rule.actionType === "RateLimit" && (
                        <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-0.5">
                                <Label className="text-[10px] text-muted-foreground">Max requests</Label>
                                <Input type="number" value={rule.rateMax} onChange={(e) => onUpdate({ rateMax: parseInt(e.target.value) })} className="h-7 text-[11px] font-mono" />
                            </div>
                            <div className="space-y-0.5">
                                <Label className="text-[10px] text-muted-foreground">Window</Label>
                                <Input value={rule.rateWindow} onChange={(e) => onUpdate({ rateWindow: e.target.value })} className="h-7 text-[11px] font-mono" placeholder="60s" />
                            </div>
                            <div className="space-y-0.5">
                                <Label className="text-[10px] text-muted-foreground">Key</Label>
                                <Select value={rule.rateKey} onChange={(e) => onUpdate({ rateKey: e.target.value })} className="h-7 text-[11px]">
                                    <option value="token">Per Token</option>
                                    <option value="ip">Per IP</option>
                                    <option value="agent">Per Agent</option>
                                    <option value="global">Global</option>
                                </Select>
                            </div>
                        </div>
                    )}
                    {rule.actionType === "Redact" && (
                        <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-0.5">
                                <Label className="text-[10px] text-muted-foreground">Direction</Label>
                                <Select value={rule.redactDirection} onChange={(e) => onUpdate({ redactDirection: e.target.value })} className="h-7 text-[11px]">
                                    <option value="Request">Request</option>
                                    <option value="Response">Response</option>
                                    <option value="Both">Both</option>
                                </Select>
                            </div>
                            <div className="space-y-0.5">
                                <Label className="text-[10px] text-muted-foreground">Patterns</Label>
                                <Input value={rule.redactPatterns} onChange={(e) => onUpdate({ redactPatterns: e.target.value })} className="h-7 text-[11px] font-mono" placeholder="email,ssn,phone" />
                            </div>
                            <div className="space-y-0.5">
                                <Label className="text-[10px] text-muted-foreground">Fields</Label>
                                <Input value={rule.redactFields} onChange={(e) => onUpdate({ redactFields: e.target.value })} className="h-7 text-[11px] font-mono" placeholder="password,secret" />
                            </div>
                        </div>
                    )}
                    {rule.actionType === "RequireApproval" && (
                        <div className="space-y-0.5 w-32">
                            <Label className="text-[10px] text-muted-foreground">Timeout (sec)</Label>
                            <Input type="number" value={rule.hitlTimeout} onChange={(e) => onUpdate({ hitlTimeout: parseInt(e.target.value) })} className="h-7 text-[11px] font-mono" />
                        </div>
                    )}
                    {rule.actionType === "Throttle" && (
                        <div className="space-y-0.5 w-32">
                            <Label className="text-[10px] text-muted-foreground">Delay (ms)</Label>
                            <Input type="number" value={rule.throttleMs} onChange={(e) => onUpdate({ throttleMs: parseInt(e.target.value) })} className="h-7 text-[11px] font-mono" />
                        </div>
                    )}
                    {rule.actionType === "Log" && (
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-0.5">
                                <Label className="text-[10px] text-muted-foreground">Level</Label>
                                <Select value={rule.logLevel} onChange={(e) => onUpdate({ logLevel: e.target.value })} className="h-7 text-[11px]">
                                    <option value="info">Info</option>
                                    <option value="warn">Warn</option>
                                    <option value="error">Error</option>
                                </Select>
                            </div>
                            <div className="space-y-0.5">
                                <Label className="text-[10px] text-muted-foreground">Tags</Label>
                                <Input value={rule.logTags} onChange={(e) => onUpdate({ logTags: e.target.value })} className="h-7 text-[11px] font-mono" placeholder="compliance,audit" />
                            </div>
                        </div>
                    )}
                    {rule.actionType === "Tag" && (
                        <div className="grid grid-cols-2 gap-2">
                            <Input value={rule.tagKey} onChange={(e) => onUpdate({ tagKey: e.target.value })} className="h-7 text-[11px] font-mono" placeholder="key" />
                            <Input value={rule.tagValue} onChange={(e) => onUpdate({ tagValue: e.target.value })} className="h-7 text-[11px] font-mono" placeholder="value" />
                        </div>
                    )}
                    {rule.actionType === "Transform" && (
                        <div className="space-y-0.5">
                            <Label className="text-[10px] text-muted-foreground">Operations JSON</Label>
                            <textarea
                                className="flex min-h-[60px] w-full rounded-md border border-input bg-muted/30 px-2 py-1 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                                value={rule.transformOps}
                                onChange={(e) => onUpdate({ transformOps: e.target.value })}
                                placeholder={'[{"AppendSystemPrompt": {"text": "Be helpful"}}]'}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
