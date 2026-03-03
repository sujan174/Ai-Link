"use client";

import { useState, useMemo, use } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import {
    getPrompt,
    createVersion,
    deployVersion,
    Prompt,
    PromptVersion,
    CreateVersionRequest,
    swrFetcher,
} from "@/lib/api";
import {
    ArrowLeft,
    GitBranch,
    Tag,
    Plus,
    Rocket,
    Loader2,
    Copy,
    Clock,
    MessageSquare,
    Settings2,
    Play,
    ChevronDown,
    ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageSkeleton } from "@/components/page-skeleton";

export default function PromptDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const {
        data,
        mutate,
        isLoading: loading,
    } = useSWR<{ prompt: Prompt; versions: PromptVersion[]; version_count: number }>(
        `/prompts/${id}`,
        swrFetcher
    );

    const [publishOpen, setPublishOpen] = useState(false);
    const [deployOpen, setDeployOpen] = useState(false);
    const [selectedVersion, setSelectedVersion] = useState<PromptVersion | null>(null);

    // Editor state
    const [model, setModel] = useState("gpt-4o");
    const [temperature, setTemperature] = useState("1.0");
    const [maxTokens, setMaxTokens] = useState("");
    const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([
        { role: "system", content: "" },
        { role: "user", content: "" },
    ]);
    const [commitMessage, setCommitMessage] = useState("");
    const [publishing, setPublishing] = useState(false);

    // Deploy state
    const [deployVersionNum, setDeployVersionNum] = useState("");
    const [deployLabel, setDeployLabel] = useState("production");
    const [deploying, setDeploying] = useState(false);

    const prompt = data?.prompt;
    const versions = data?.versions || [];

    // Detect {{variables}} in messages
    const detectedVars = useMemo(() => {
        const vars = new Set<string>();
        messages.forEach((m) => {
            const matches = m.content.matchAll(/\{\{(\w+)\}\}/g);
            for (const match of matches) {
                vars.add(match[1]);
            }
        });
        return Array.from(vars);
    }, [messages]);

    const loadVersion = (v: PromptVersion) => {
        setSelectedVersion(v);
        setModel(v.model);
        setTemperature(String(v.temperature ?? 1.0));
        setMaxTokens(v.max_tokens ? String(v.max_tokens) : "");
        setMessages(
            (v.messages as Array<{ role: string; content: string }>) || [
                { role: "system", content: "" },
            ]
        );
    };

    const addMessage = () => {
        setMessages([...messages, { role: "user", content: "" }]);
    };

    const removeMessage = (i: number) => {
        setMessages(messages.filter((_, idx) => idx !== i));
    };

    const updateMessage = (i: number, field: "role" | "content", value: string) => {
        setMessages(messages.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));
    };

    const handlePublish = async () => {
        if (messages.every((m) => !m.content.trim())) {
            toast.error("Add at least one message with content");
            return;
        }
        setPublishing(true);
        try {
            const payload: CreateVersionRequest = {
                model,
                messages,
                temperature: parseFloat(temperature) || undefined,
                max_tokens: maxTokens ? parseInt(maxTokens) : undefined,
                commit_message: commitMessage || undefined,
            };
            await createVersion(id, payload);
            toast.success("Version published");
            setCommitMessage("");
            setPublishOpen(false);
            mutate();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to publish");
        } finally {
            setPublishing(false);
        }
    };

    const handleDeploy = async () => {
        setDeploying(true);
        try {
            await deployVersion(id, {
                version: parseInt(deployVersionNum),
                label: deployLabel,
            });
            toast.success(`Version ${deployVersionNum} deployed to "${deployLabel}"`);
            setDeployOpen(false);
            mutate();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Deploy failed");
        } finally {
            setDeploying(false);
        }
    };

    if (loading) return <PageSkeleton cards={2} rows={3} />;
    if (!prompt) return <div className="p-8 text-center text-muted-foreground">Prompt not found</div>;

    return (
        <div className="p-4 max-w-[1600px] mx-auto space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between animate-fade-in">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => router.push("/prompts")}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-lg font-semibold">{prompt.name}</h1>
                        <p className="text-xs font-mono text-muted-foreground">{prompt.slug}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            navigator.clipboard.writeText(
                                `curl -X POST /api/v1/prompts/by-slug/${prompt.slug}/render \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -d '{"variables": {}, "label": "production"}'`
                            );
                            toast.success("API snippet copied");
                        }}
                    >
                        <Copy className="h-3.5 w-3.5 mr-1.5" /> API Snippet
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/prompts/${id}/playground`)}
                    >
                        <Play className="h-3.5 w-3.5 mr-1.5" /> Playground
                    </Button>
                    <Button size="sm" onClick={() => setDeployOpen(true)} disabled={versions.length === 0}>
                        <Rocket className="h-3.5 w-3.5 mr-1.5" /> Deploy
                    </Button>
                </div>
            </div>

            {/* Main Layout */}
            <div className="grid lg:grid-cols-[1fr_320px] gap-4">
                {/* Left — Editor */}
                <Card className="border-border/60">
                    <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between bg-muted/20">
                        <div className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-primary" />
                            <span className="font-semibold text-sm">Prompt Editor</span>
                            {selectedVersion && (
                                <Badge variant="outline" className="text-[10px] ml-1">
                                    Editing from v{selectedVersion.version}
                                </Badge>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={addMessage}>
                                <Plus className="h-3 w-3 mr-1" /> Message
                            </Button>
                            <Button size="sm" onClick={() => setPublishOpen(true)}>
                                <GitBranch className="h-3 w-3 mr-1" /> Publish
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 space-y-4">
                        {/* Model + Params */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground uppercase">Model</Label>
                                <Input
                                    value={model}
                                    onChange={(e) => setModel(e.target.value)}
                                    className="h-8 text-xs font-mono"
                                    placeholder="gpt-4o"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground uppercase">Temperature</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    max="2"
                                    step="0.1"
                                    value={temperature}
                                    onChange={(e) => setTemperature(e.target.value)}
                                    className="h-8 text-xs"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground uppercase">Max Tokens</Label>
                                <Input
                                    type="number"
                                    value={maxTokens}
                                    onChange={(e) => setMaxTokens(e.target.value)}
                                    className="h-8 text-xs"
                                    placeholder="Auto"
                                />
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="space-y-3">
                            {messages.map((msg, i) => (
                                <div
                                    key={i}
                                    className={cn(
                                        "rounded-lg border p-3 space-y-2 transition-colors",
                                        msg.role === "system"
                                            ? "border-violet-500/20 bg-violet-500/5"
                                            : msg.role === "assistant"
                                                ? "border-emerald-500/20 bg-emerald-500/5"
                                                : "border-border/60"
                                    )}
                                >
                                    <div className="flex items-center justify-between">
                                        <Select
                                            value={msg.role}
                                            onValueChange={(v) => updateMessage(i, "role", v)}
                                        >
                                            <SelectTrigger className="w-[110px] h-7 text-[11px] font-semibold uppercase">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="system">System</SelectItem>
                                                <SelectItem value="user">User</SelectItem>
                                                <SelectItem value="assistant">Assistant</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        {messages.length > 1 && (
                                            <button
                                                onClick={() => removeMessage(i)}
                                                className="text-muted-foreground hover:text-rose-400 transition-colors text-xs"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                    <Textarea
                                        value={msg.content}
                                        onChange={(e) => updateMessage(i, "content", e.target.value)}
                                        placeholder={
                                            msg.role === "system"
                                                ? "You are a {{role}} helping {{user_name}} with..."
                                                : msg.role === "user"
                                                    ? "Ask a question using {{variables}}..."
                                                    : "Expected response pattern..."
                                        }
                                        className="min-h-[80px] text-sm font-mono border-0 bg-transparent focus-visible:ring-0 p-0 resize-none"
                                        spellCheck={false}
                                    />
                                </div>
                            ))}
                        </div>

                        {/* Detected Variables */}
                        {detectedVars.length > 0 && (
                            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                                <p className="text-[10px] font-semibold uppercase text-primary mb-2">
                                    Detected Variables ({detectedVars.length})
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {detectedVars.map((v) => (
                                        <Badge
                                            key={v}
                                            variant="outline"
                                            className="font-mono text-[11px] border-primary/30"
                                        >
                                            {`{{${v}}}`}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Right — Version Timeline */}
                <Card className="border-border/60 h-fit">
                    <CardHeader className="py-3 px-4 border-b bg-muted/20">
                        <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold text-sm">
                                Versions ({versions.length})
                            </span>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0 max-h-[600px] overflow-y-auto">
                        {versions.length === 0 ? (
                            <div className="p-6 text-center text-muted-foreground text-xs">
                                No versions yet. Edit and publish your first version.
                            </div>
                        ) : (
                            <div className="divide-y divide-border/40">
                                {versions.map((v) => {
                                    const labels: string[] = Array.isArray(v.labels) ? v.labels : [];
                                    const isSelected = selectedVersion?.id === v.id;
                                    return (
                                        <button
                                            key={v.id}
                                            onClick={() => loadVersion(v)}
                                            className={cn(
                                                "w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors",
                                                isSelected && "bg-primary/5 border-l-2 border-primary"
                                            )}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-semibold text-xs tabular-nums">
                                                    v{v.version}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground">
                                                    {new Date(v.created_at).toLocaleDateString("en-US", {
                                                        month: "short",
                                                        day: "numeric",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    })}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <Badge
                                                    variant="secondary"
                                                    className="text-[9px] font-mono px-1 h-4"
                                                >
                                                    {v.model}
                                                </Badge>
                                                {labels.map((l: string) => (
                                                    <Badge
                                                        key={l}
                                                        className={cn(
                                                            "text-[9px] px-1 h-4",
                                                            l === "production"
                                                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                                                : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                                        )}
                                                    >
                                                        {l}
                                                    </Badge>
                                                ))}
                                            </div>
                                            {v.commit_message && (
                                                <p className="text-[11px] text-muted-foreground truncate">
                                                    {v.commit_message}
                                                </p>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Publish Dialog */}
            <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Publish New Version</DialogTitle>
                        <DialogDescription>
                            This will create version {(versions[0]?.version || 0) + 1} of this prompt.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Commit Message (optional)</Label>
                            <Input
                                value={commitMessage}
                                onChange={(e) => setCommitMessage(e.target.value)}
                                placeholder="e.g. Improved system prompt tone"
                            />
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                            <p>
                                <strong>Model:</strong>{" "}
                                <span className="font-mono">{model}</span>
                            </p>
                            <p>
                                <strong>Messages:</strong> {messages.length}
                            </p>
                            <p>
                                <strong>Temperature:</strong> {temperature}
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPublishOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handlePublish} disabled={publishing}>
                            {publishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Publish v{(versions[0]?.version || 0) + 1}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Deploy Dialog */}
            <Dialog open={deployOpen} onOpenChange={setDeployOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Rocket className="h-5 w-5 text-primary" /> Deploy Version
                        </DialogTitle>
                        <DialogDescription>
                            Atomically promote a version to a deployment label.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Version</Label>
                            <Select value={deployVersionNum} onValueChange={setDeployVersionNum}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select version..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {versions.map((v) => (
                                        <SelectItem key={v.version} value={String(v.version)}>
                                            v{v.version} — {v.model}
                                            {v.commit_message ? ` (${v.commit_message})` : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Label</Label>
                            <Select value={deployLabel} onValueChange={setDeployLabel}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="production">production</SelectItem>
                                    <SelectItem value="staging">staging</SelectItem>
                                    <SelectItem value="canary">canary</SelectItem>
                                    <SelectItem value="development">development</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-[10px] text-muted-foreground">
                                The label will be removed from any other version of this prompt.
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeployOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleDeploy} disabled={deploying || !deployVersionNum}>
                            {deploying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Deploy to {deployLabel}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
