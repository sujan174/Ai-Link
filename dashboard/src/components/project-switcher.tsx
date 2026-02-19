"use client";

import * as React from "react";
import { ChevronsUpDown, Plus, Check, Building2 } from "lucide-react";
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

interface ProjectSwitcherProps extends React.HTMLAttributes<HTMLDivElement> {
    collapsed?: boolean;
}

export function ProjectSwitcher({ className, collapsed }: ProjectSwitcherProps) {
    const { projects, selectedProjectId, selectProject, createProject } = useProject();
    const [open, setOpen] = React.useState(false);
    const [showNewProjectDialog, setShowNewProjectDialog] = React.useState(false);
    const [newProjectName, setNewProjectName] = React.useState("");

    const selectedProject = projects.find((p) => p.id === selectedProjectId);

    const handleCreate = async () => {
        if (!newProjectName) return;
        await createProject(newProjectName);
        setShowNewProjectDialog(false);
        setNewProjectName("");
    };

    return (
        <Dialog open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog}>
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
                <DropdownMenuContent className="w-[200px] p-0">
                    <DropdownMenuGroup>
                        <DropdownMenuLabel>Projects</DropdownMenuLabel>
                        {projects.map((project) => (
                            <DropdownMenuItem
                                key={project.id}
                                onSelect={() => {
                                    selectProject(project.id);
                                    setOpen(false);
                                }}
                                className="text-sm"
                            >
                                <Building2 className="mr-2 h-4 w-4" />
                                {project.name}
                                <Check
                                    className={cn(
                                        "ml-auto h-4 w-4",
                                        selectedProjectId === project.id
                                            ? "opacity-100"
                                            : "opacity-0"
                                    )}
                                />
                            </DropdownMenuItem>
                        ))}
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
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setShowNewProjectDialog(false)}>Cancel</Button>
                    <Button onClick={handleCreate}>Create</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
