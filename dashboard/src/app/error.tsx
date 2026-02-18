"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-rose-500/10">
                <AlertTriangle className="h-10 w-10 text-rose-500" />
            </div>
            <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight">Something went wrong!</h2>
                <p className="max-w-[500px] text-muted-foreground text-balance">
                    {error.message || "An unexpected error occurred. We've logged it for our team."}
                </p>
            </div>
            <div className="flex items-center gap-2">
                <Button onClick={() => window.location.reload()} variant="outline">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Reload Page
                </Button>
                <Button onClick={() => reset()}>Try Again</Button>
            </div>
        </div>
    );
}
