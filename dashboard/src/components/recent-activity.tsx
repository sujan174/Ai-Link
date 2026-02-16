"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AuditLog } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";

interface RecentActivityProps {
    logs: AuditLog[];
}

export function RecentActivity({ logs }: RecentActivityProps) {
    return (
        <Card className="col-span-3">
            <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>
                    Latest API requests processed by the gateway
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-8">
                    {logs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No recent activity.</p>
                    ) : (
                        logs.map((log) => (
                            <div key={log.id} className="flex items-center">
                                <Avatar className="h-9 w-9">
                                    <AvatarFallback className="bg-primary/10 text-primary">
                                        {log.method[0]}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="ml-4 space-y-1">
                                    <p className="text-sm font-medium leading-none">
                                        {log.method} {log.path}
                                    </p>
                                    <p className="text-xs text-muted-foreground" title={log.agent_name || "Unknown Agent"}>
                                        {(log.agent_name || "Unknown Agent").length > 30
                                            ? (log.agent_name || "Unknown Agent").substring(0, 30) + "..."
                                            : (log.agent_name || "Unknown Agent")}
                                    </p>
                                </div>
                                <div className="ml-auto font-medium text-xs text-muted-foreground">
                                    <Badge variant="outline" className="mr-2">
                                        {log.response_latency_ms}ms
                                    </Badge>
                                    {new Date(log.created_at).toLocaleTimeString()}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
