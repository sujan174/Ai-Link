import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
    className?: string;
}

export function EmptyState({
    icon: Icon,
    title,
    description,
    actionLabel,
    onAction,
    className,
}: EmptyStateProps) {
    return (
        <div className={cn(
            "flex min-h-[400px] flex-col items-center justify-center rounded-md border border-dashed p-4 text-center animate-in fade-in-50",
            className
        )}>
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted/50">
                <Icon className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">{title}</h3>
            <p className="mb-4 mt-2 max-w-sm text-[13px] text-muted-foreground text-balance">
                {description}
            </p>
            {actionLabel && onAction && (
                <Button onClick={onAction} size="sm" className="mt-2">
                    {actionLabel}
                </Button>
            )}
        </div>
    );
}
