"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { listProjects, createProject as apiCreateProject, Project } from "@/lib/api";
import { toast } from "sonner";


interface ProjectContextType {
    projects: Project[];
    selectedProjectId: string | null;
    isLoading: boolean;
    selectProject: (projectId: string) => void;
    createProject: (name: string) => Promise<void>;
    refreshProjects: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);


    const refreshProjects = useCallback(async () => {
        try {
            const data = await listProjects();
            setProjects(data);

            // Auto-select if none selected
            const cached = localStorage.getItem("ailink_project_id");
            if (cached && data.find(p => p.id === cached)) {
                setSelectedProjectId(cached);
            } else if (data.length > 0) {
                // Default to first one (likely 'default')
                const defaultProj = data[0].id;
                setSelectedProjectId(defaultProj);
                localStorage.setItem("ailink_project_id", defaultProj);
            }
        } catch {
            toast.error("Failed to load projects");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshProjects();
    }, [refreshProjects]);

    const selectProject = (projectId: string) => {
        setSelectedProjectId(projectId);
        localStorage.setItem("ailink_project_id", projectId);
        // Reload page to force all data fetches to refresh with new ID
        // This is a crude but effective way to ensure all useStates/useEffects in pages reset
        window.location.reload();
    };

    const createProject = async (name: string) => {
        try {
            const newProj = await apiCreateProject(name);
            toast.success("Project created");
            await refreshProjects();
            selectProject(newProj.id);
        } catch (e) {
            toast.error("Failed to create project");
            throw e;
        }
    };

    return (
        <ProjectContext.Provider value={{
            projects,
            selectedProjectId,
            isLoading,
            selectProject,
            createProject,
            refreshProjects
        }}>
            {children}
        </ProjectContext.Provider>
    );
}

export function useProject() {
    const context = useContext(ProjectContext);
    if (context === undefined) {
        throw new Error("useProject must be used within a ProjectProvider");
    }
    return context;
}
