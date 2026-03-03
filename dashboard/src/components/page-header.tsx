import { cn } from "@/lib/utils";

interface PageHeaderProps {
    title: string;
    description?: string;
    children?: React.ReactNode;
    className?: string;
}

/**
 * Consistent page header with H1 title, optional description, and action slot.
 * Used on every page to enforce visual hierarchy.
 */
export function PageHeader({ title, description, children, className }: PageHeaderProps) {
    return (
        <div className={cn("flex items-center justify-between gap-4", className)}>
            <div className="min-w-0">
                <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
                {description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                )}
            </div>
            {children && (
                <div className="flex items-center gap-2 shrink-0">
                    {children}
                </div>
            )}
        </div>
    );
}
