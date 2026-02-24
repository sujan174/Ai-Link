"use client";

import { useEffect, useState } from "react";
import { useProject } from "@/contexts/project-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export default function ProjectSettingsPage() {
    const { projects, selectedProjectId, updateProject, deleteProject } = useProject();
    const router = useRouter();

    // Find the currently selected project
    const project = projects.find(p => p.id === selectedProjectId);

    // Local state for the form
    const [projectName, setProjectName] = useState("");
    const [isRenaming, setIsRenaming] = useState(false);

    // Local state for deletion confirmation
    const [deleteConfirmation, setDeleteConfirmation] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);

    // Initialize state when project loads
    useEffect(() => {
        if (project) {
            setProjectName(project.name);
        }
    }, [project]);

    if (!project) {
        return <div className="p-8 animate-pulse text-muted-foreground">Loading project details...</div>;
    }

    const handleRename = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!projectName.trim()) return;

        setIsRenaming(true);
        try {
            await updateProject(project.id, projectName);
            // Success toast is handled in context
        } catch (error) {
            // Error toast is handled in context
            console.error(error);
        } finally {
            setIsRenaming(false);
        }
    };

    const handleDelete = async () => {
        if (deleteConfirmation !== project.name) {
            toast.error("Please type the project name to confirm deletion");
            return;
        }

        if (confirm("Are you absolutely sure? This action cannot be undone.")) {
            setIsDeleting(true);
            try {
                await deleteProject(project.id);
                // Redirect handled in context/router logic, usually to default project or refresh
                router.push("/");
            } catch (error) {
                console.error(error);
                setIsDeleting(false);
            }
        }
    };

    return (
        <div className="flex flex-col gap-8 max-w-4xl animate-fade-in p-6 pt-2">
            {/* General Settings */}

            {/* General Settings */}
            <Card>
                <CardHeader>
                    <CardTitle>General</CardTitle>
                    <CardDescription>
                        Update your project's display name and view unique identifiers.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-2">
                        <Label htmlFor="projectId">Project ID</Label>
                        <Input
                            id="projectId"
                            value={project.id}
                            readOnly
                            className="bg-muted font-mono"
                        />
                        <p className="text-xs text-muted-foreground">
                            Used when making API requests to identify this project.
                        </p>
                    </div>

                    <form onSubmit={handleRename} className="grid gap-2">
                        <Label htmlFor="projectName">Project Name</Label>
                        <div className="flex gap-2">
                            <Input
                                id="projectName"
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                placeholder="My Awesome Project"
                            />
                            <Button
                                type="submit"
                                disabled={isRenaming || !projectName.trim() || projectName === project.name}
                            >
                                {isRenaming ? "Saving..." : <><Save className="mr-2 h-4 w-4" /> Save Name</>}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card className="border-destructive/20 bg-destructive/5">
                <CardHeader>
                    <CardTitle className="text-destructive flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" /> Danger Zone
                    </CardTitle>
                    <CardDescription>
                        Irreversible actions. Proceed with caution.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-md border border-destructive/20 bg-background p-4">
                        <h3 className="font-semibold text-destructive mb-2">Delete Project</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            This will permanently delete the project <strong>{project.name}</strong> and all its associated resources (tokens, logs, services). This action cannot be undone.
                        </p>

                        <div className="space-y-2">
                            <Label htmlFor="deleteConfirm" className="text-destructive">
                                Type <strong>{project.name}</strong> to confirm
                            </Label>
                            <div className="flex gap-2 items-center">
                                <Input
                                    id="deleteConfirm"
                                    value={deleteConfirmation}
                                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                                    placeholder={project.name}
                                    className="border-destructive/30 focus-visible:ring-destructive/30"
                                />
                                <Button
                                    variant="destructive"
                                    onClick={handleDelete}
                                    disabled={isDeleting || deleteConfirmation !== project.name}
                                >
                                    {isDeleting ? "Deleting..." : <><Trash2 className="mr-2 h-4 w-4" /> Delete Project</>}
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
