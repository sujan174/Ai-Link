"use client";

import { useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import {
    listPrompts,
    createPrompt,
    deletePrompt,
    Prompt,
    CreatePromptRequest,
    swrFetcher,
} from "@/lib/api";
import {
    Plus,
    RefreshCw,
    MessageSquareText,
    FolderOpen,
    Trash2,
    Search,
    GitBranch,
    Tag,
    Loader2,
    Copy,
    AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { PageSkeleton } from "@/components/page-skeleton";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function PromptsPage() {
    const router = useRouter();
    const {
        data: prompts = [],
        mutate: mutatePrompts,
        isLoading: loading,
    } = useSWR<Prompt[]>("/prompts", swrFetcher);

    const [createOpen, setCreateOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Prompt | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

    // Derive folders from prompts
    const folders = Array.from(new Set(prompts.map((p) => p.folder))).sort();

    // Filter prompts
    const filtered = prompts.filter((p) => {
        if (selectedFolder && p.folder !== selectedFolder) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (
                p.name.toLowerCase().includes(q) ||
                p.slug.toLowerCase().includes(q) ||
                p.description.toLowerCase().includes(q)
            );
        }
        return true;
    });

    const handleCreate = async (data: CreatePromptRequest) => {
        await createPrompt(data);
        mutatePrompts();
        setCreateOpen(false);
        toast.success("Prompt created");
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            await deletePrompt(deleteTarget.id);
            mutatePrompts();
            toast.success("Prompt deleted");
            setDeleteTarget(null);
        } catch {
            toast.error("Failed to delete prompt");
        }
    };

    return (
        <div className="p-4 space-y-6 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between animate-fade-in">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">Prompts</h1>
                    <p className="text-sm text-muted-foreground">
                        Versioned prompt templates with deployment labels and a render API.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => mutatePrompts()}
                        disabled={loading}
                    >
                        <RefreshCw
                            className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")}
                        />
                        Refresh
                    </Button>
                    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm">
                                <Plus className="mr-1.5 h-3.5 w-3.5" /> New Prompt
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[440px]">
                            <CreatePromptForm
                                onSubmit={handleCreate}
                                onCancel={() => setCreateOpen(false)}
                            />
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-3 animate-slide-up">
                <Card className="glass-card hover-lift p-4">
                    <div className="flex items-center gap-3">
                        <div className="icon-circle-blue">
                            <MessageSquareText className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-xl font-semibold tabular-nums">
                                {prompts.length}
                            </p>
                            <p className="text-xs text-muted-foreground">Total Prompts</p>
                        </div>
                    </div>
                </Card>
                <Card className="glass-card hover-lift p-4">
                    <div className="flex items-center gap-3">
                        <div className="icon-circle-emerald">
                            <GitBranch className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-xl font-semibold tabular-nums text-emerald-500">
                                {prompts.reduce((acc, p) => acc + (p.version_count || 0), 0)}
                            </p>
                            <p className="text-xs text-muted-foreground">Total Versions</p>
                        </div>
                    </div>
                </Card>
                <Card className="glass-card hover-lift p-4">
                    <div className="flex items-center gap-3">
                        <div className="icon-circle-violet">
                            <FolderOpen className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-xl font-semibold tabular-nums text-violet-500">
                                {folders.length}
                            </p>
                            <p className="text-xs text-muted-foreground">Folders</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Search + Folder filter */}
            <div className="flex gap-3 animate-slide-up stagger-1">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        placeholder="Search prompts..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-9"
                    />
                </div>
                {folders.length > 1 && (
                    <div className="flex gap-1.5">
                        <button
                            onClick={() => setSelectedFolder(null)}
                            className={cn(
                                "px-2.5 py-1 rounded-md text-xs font-medium transition-all border",
                                !selectedFolder
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                        >
                            All
                        </button>
                        {folders.map((f) => (
                            <button
                                key={f}
                                onClick={() =>
                                    setSelectedFolder(selectedFolder === f ? null : f)
                                }
                                className={cn(
                                    "px-2.5 py-1 rounded-md text-xs font-medium transition-all border",
                                    selectedFolder === f
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-transparent text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {f === "/" ? "Root" : f}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Prompt Grid */}
            {loading ? (
                <PageSkeleton cards={3} rows={5} />
            ) : filtered.length === 0 ? (
                <EmptyState
                    icon={MessageSquareText}
                    title={searchQuery ? "No matching prompts" : "No prompts yet"}
                    description="Create a prompt template to manage versions, deploy labels, and use the render API."
                    actionLabel="New Prompt"
                    onAction={() => setCreateOpen(true)}
                    className="bg-card/50 backdrop-blur-sm"
                />
            ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 animate-slide-up stagger-2">
                    {filtered.map((p) => (
                        <Card
                            key={p.id}
                            className="glass-card hover-lift p-4 cursor-pointer group transition-all"
                            onClick={() => router.push(`/prompts/${p.id}`)}
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className="min-w-0 flex-1">
                                    <h3 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                                        {p.name}
                                    </h3>
                                    <p className="text-[11px] font-mono text-muted-foreground truncate">
                                        {p.slug}
                                    </p>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteTarget(p);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-400 transition-all p-1"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>

                            {p.description && (
                                <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                                    {p.description}
                                </p>
                            )}

                            <div className="flex items-center gap-2 flex-wrap">
                                {p.latest_model && (
                                    <Badge
                                        variant="secondary"
                                        className="text-[10px] font-mono px-1.5 h-5"
                                    >
                                        {p.latest_model}
                                    </Badge>
                                )}
                                <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 h-5 tabular-nums"
                                >
                                    <GitBranch className="h-2.5 w-2.5 mr-1" />v
                                    {p.latest_version || 0}
                                </Badge>
                                {p.folder !== "/" && (
                                    <Badge
                                        variant="outline"
                                        className="text-[10px] px-1.5 h-5"
                                    >
                                        <FolderOpen className="h-2.5 w-2.5 mr-1" />
                                        {p.folder}
                                    </Badge>
                                )}
                                {(p.labels as unknown as string[])?.map((l: string) => (
                                    <Badge
                                        key={l}
                                        className={cn(
                                            "text-[10px] px-1.5 h-5",
                                            l === "production"
                                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                                : l === "staging"
                                                    ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                                    : "bg-blue-500/15 text-blue-400 border-blue-500/30"
                                        )}
                                    >
                                        <Tag className="h-2.5 w-2.5 mr-0.5" />
                                        {l}
                                    </Badge>
                                ))}
                            </div>

                            <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between">
                                <span className="text-[10px] text-muted-foreground">
                                    Updated{" "}
                                    {new Date(p.updated_at).toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                    })}
                                </span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(
                                            `curl /api/v1/prompts/by-slug/${p.slug}/render?label=production`
                                        );
                                        toast.success("API snippet copied");
                                    }}
                                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all p-1"
                                    title="Copy API snippet"
                                >
                                    <Copy className="h-3 w-3" />
                                </button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Delete Confirmation */}
            <Dialog
                open={!!deleteTarget}
                onOpenChange={(open) => !open && setDeleteTarget(null)}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="h-5 w-5" /> Delete Prompt
                        </DialogTitle>
                        <DialogDescription>
                            Delete{" "}
                            <span className="font-mono font-medium text-foreground">
                                {deleteTarget?.name}
                            </span>
                            ? All versions will be removed. This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleDelete}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ── Create Prompt Form ──────────────────────────────────

function CreatePromptForm({
    onSubmit,
    onCancel,
}: {
    onSubmit: (data: CreatePromptRequest) => Promise<void>;
    onCancel: () => void;
}) {
    const [loading, setLoading] = useState(false);
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [description, setDescription] = useState("");
    const [folder, setFolder] = useState("/");

    const autoSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSubmit({
                name,
                slug: slug || autoSlug,
                description: description || undefined,
                folder: folder || "/",
            });
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : "Failed to create prompt"
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <DialogHeader>
                <DialogTitle>New Prompt</DialogTitle>
                <DialogDescription>
                    Create a versioned prompt template.
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="space-y-1.5">
                    <Label htmlFor="pname" className="text-xs">
                        Name
                    </Label>
                    <Input
                        id="pname"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Customer Support Agent"
                        required
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="pslug" className="text-xs">
                        Slug
                    </Label>
                    <Input
                        id="pslug"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder={autoSlug || "auto-generated-from-name"}
                        className="font-mono text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">
                        URL-safe key for the render API: /prompts/by-slug/
                        {slug || autoSlug || "..."}/render
                    </p>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="pdesc" className="text-xs">
                        Description (optional)
                    </Label>
                    <Input
                        id="pdesc"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="What does this prompt do?"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="pfolder" className="text-xs">
                        Folder
                    </Label>
                    <Input
                        id="pfolder"
                        value={folder}
                        onChange={(e) => setFolder(e.target.value)}
                        placeholder="/"
                    />
                    <p className="text-[10px] text-muted-foreground">
                        Organize prompts into folders, e.g. /agents/support
                    </p>
                </div>
            </div>
            <DialogFooter>
                <DialogClose asChild>
                    <Button variant="outline" type="button" onClick={onCancel}>
                        Cancel
                    </Button>
                </DialogClose>
                <Button type="submit" disabled={loading || !name.trim()}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {loading ? "Creating..." : "Create Prompt"}
                </Button>
            </DialogFooter>
        </form>
    );
}
