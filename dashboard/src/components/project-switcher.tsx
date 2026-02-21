"use client";

import * as React from "react";
import { ChevronsUpDown, Plus, Check, Building2, Trash2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProject } from "@/contexts/project-context";
import { toast } from "sonner";

interface ProjectSwitcherProps extends React.HTMLAttributes<HTMLDivElement> {
    collapsed?: boolean;
}

export function ProjectSwitcher({ className, collapsed }: ProjectSwitcherProps) {
    const { projects, selectedProjectId, selectProject, createProject, deleteProject } = useProject();
    const [open, setOpen] = React.useState(false);
    const [showNewProjectDialog, setShowNewProjectDialog] = React.useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
    const [projectToDelete, setProjectToDelete] = React.useState<{ id: string; name: string } | null>(null);
    const [newProjectName, setNewProjectName] = React.useState("");
    const [deleteConfirmName, setDeleteConfirmName] = React.useState("");
    const [deleting, setDeleting] = React.useState(false);

    const selectedProject = projects.find((p) => p.id === selectedProjectId);

    // The "default" project is the first (oldest) one — the gateway blocks deleting it too.
    const defaultProjectId = projects.length > 0 ? projects[0].id : null;

    const handleCreate = async () => {
        if (!newProjectName.trim()) return;
        await createProject(newProjectName.trim());
        setShowNewProjectDialog(false);
        setNewProjectName("");
    };

    const openDeleteDialog = (e: React.MouseEvent, project: { id: string; name: string }) => {
        e.stopPropagation(); // Don't select the project
        setProjectToDelete(project);
        setDeleteConfirmName("");
        setShowDeleteDialog(true);
        setOpen(false);
    };

    const handleDelete = async () => {
        if (!projectToDelete) return;
        if (deleteConfirmName !== projectToDelete.name) {
            toast.error("Project name doesn't match");
            return;
        }
        setDeleting(true);
        try {
            await deleteProject(projectToDelete.id);
            setShowDeleteDialog(false);
            setProjectToDelete(null);
        } catch (e: any) {
            const msg = e?.message || "";
            if (msg.includes("400")) {
                toast.error("Cannot delete the default project");
            } else if (msg.includes("403")) {
                toast.error("Only admins can delete projects");
            } else {
                toast.error("Failed to delete project");
            }
        } finally {
            setDeleting(false);
        }
    };

    return (
        <>
            {/* Create Project Dialog */}
            <Dialog open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Project</DialogTitle>
                        <DialogDescription>
                            Add a new project to manage isolated resources.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Project Name</Label>
                            <Input
                                id="name"
                                placeholder="Ex. Marketing Prod"
                                value={newProjectName}
                                onChange={(e) => setNewProjectName(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowNewProjectDialog(false)}>Cancel</Button>
                        <Button onClick={handleCreate} disabled={!newProjectName.trim()}>Create</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Project Confirmation Dialog */}
            <Dialog open={showDeleteDialog} onOpenChange={(v) => { if (!deleting) setShowDeleteDialog(v); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-rose-500">
                            <AlertTriangle className="h-5 w-5" />
                            Delete Project
                        </DialogTitle>
                        <DialogDescription className="pt-1">
                            This will permanently delete{" "}
                            <strong className="text-foreground">{projectToDelete?.name}</strong>{" "}
                            and <strong className="text-rose-400">all of its tokens, credentials, policies, and audit logs</strong>.
                            This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3 py-4">
                        <Label htmlFor="confirm-name" className="text-sm text-muted-foreground">
                            Type <code className="font-mono bg-muted px-1 rounded text-foreground">{projectToDelete?.name}</code> to confirm
                        </Label>
                        <Input
                            id="confirm-name"
                            placeholder={projectToDelete?.name}
                            value={deleteConfirmName}
                            onChange={(e) => setDeleteConfirmName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleDelete()}
                            className="font-mono border-rose-500/30 focus-visible:ring-rose-500/40"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deleting}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={deleteConfirmName !== projectToDelete?.name || deleting}
                        >
                            {deleting ? "Deleting…" : "Delete Project"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Project Dropdown */}
            <DropdownMenu open={open} onOpenChange={setOpen}>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        aria-label="Select a team"
                        className={cn("w-full justify-between", className)}
                    >
                        <Building2 className="mr-2 h-4 w-4" />
                        <span className="truncate">{selectedProject?.name || "Select Project..."}</span>
                        <ChevronsUpDown className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[220px] p-0">
                    <DropdownMenuGroup>
                        <DropdownMenuLabel>Projects</DropdownMenuLabel>
                        {projects.map((project) => {
                            const isDefault = project.id === defaultProjectId;
                            return (
                                <DropdownMenuItem
                                    key={project.id}
                                    onSelect={() => {
                                        selectProject(project.id);
                                        setOpen(false);
                                    }}
                                    className="text-sm group pr-2"
                                >
                                    <Building2 className="mr-2 h-4 w-4 flex-shrink-0" />
                                    <span className="truncate flex-1">{project.name}</span>
                                    <Check
                                        className={cn(
                                            "h-4 w-4 flex-shrink-0 mr-1",
                                            selectedProjectId === project.id ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {/* Delete button — hidden for default project */}
                                    {!isDefault && (
                                        <button
                                            onClick={(e) => openDeleteDialog(e, project)}
                                            className="ml-1 h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-rose-500/10 hover:text-rose-500 transition-all flex-shrink-0"
                                            title="Delete project (admin only)"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </button>
                                    )}
                                </DropdownMenuItem>
                            );
                        })}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onSelect={() => {
                            setOpen(false);
                            setShowNewProjectDialog(true);
                        }}
                    >
                        <Plus className="mr-2 h-5 w-5" />
                        Create Project
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    );
}
