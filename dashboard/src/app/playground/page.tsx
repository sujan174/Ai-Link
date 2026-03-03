import { PlaygroundClient } from "@/components/playground/playground-client";

export default function PlaygroundPage() {
    return (
        <div className="h-[calc(100vh-7rem)] flex flex-col">
            <div className="mb-4">
                <h1 className="text-lg font-semibold tracking-tight">API Playground</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Test your gateway configuration and policies in real-time.
                </p>
            </div>
            <PlaygroundClient />
        </div>
    );
}
