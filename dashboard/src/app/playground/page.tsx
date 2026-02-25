import { PlaygroundClient } from "@/components/playground/playground-client";

export default function PlaygroundPage() {
    return (
        <div className="p-4 h-[calc(100vh-60px)] max-w-[1800px] mx-auto flex flex-col">
            <div className="mb-6 space-y-1">
                <h1 className="text-xl font-semibold tracking-tight">API Playground</h1>
                <p className="text-muted-foreground">
                    Test your gateway configuration and policies in real-time.
                </p>
            </div>
            <PlaygroundClient />
        </div>
    );
}
