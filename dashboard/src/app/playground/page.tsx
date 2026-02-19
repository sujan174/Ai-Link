import { Card } from "@/components/ui/card";
import { FlaskConical } from "lucide-react";

export default function PlaygroundPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
            <div className="p-4 rounded-full bg-muted">
                <FlaskConical className="w-12 h-12 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-bold">API Playground</h1>
            <p className="text-muted-foreground max-w-md">
                Test your gateway configuration directly from the dashboard. Send requests to your configured services and see the traces in real-time.
            </p>
            <Card className="p-4 bg-muted/30 border-dashed">
                <p className="text-sm font-mono text-muted-foreground">Coming Soon</p>
            </Card>
        </div>
    );
}
