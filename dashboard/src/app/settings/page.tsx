"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { useTheme } from "next-themes";
import {
    Save,
    Shield,
    RefreshCw,
    LayoutDashboard,
    Lock,
    AlertTriangle,
    CheckCircle2,
    Settings as SettingsIcon,
    Trash2,
    Moon,
    Sun,
    Laptop
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { getSettings, updateSettings, flushCache, swrFetcher, SystemSettings } from "@/lib/api";
import { cn } from "@/lib/utils";

type SettingsTab = "general" | "security" | "advanced";

export default function SettingsPage() {
    const { data: settings, mutate } = useSWR<SystemSettings>("/settings", swrFetcher);
    const { theme, setTheme } = useTheme();

    const [activeTab, setActiveTab] = useState<SettingsTab>("general");

    // Local state for form inputs
    const [gatewayName, setGatewayName] = useState("");
    const [adminEmail, setAdminEmail] = useState("");
    const [maintenanceMode, setMaintenanceMode] = useState(false);
    const [saving, setSaving] = useState(false);
    const [flushing, setFlushing] = useState(false);

    // Sync local state with fetched data
    useEffect(() => {
        if (settings) {
            setGatewayName(typeof settings.gateway_name === 'string' ? settings.gateway_name : "");
            setAdminEmail(typeof settings.admin_email === 'string' ? settings.admin_email : "");
            setMaintenanceMode(settings.maintenance_mode === true || settings.maintenance_mode === "true");
        }
    }, [settings]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateSettings({
                gateway_name: gatewayName,
                admin_email: adminEmail,
                maintenance_mode: maintenanceMode
            });
            await mutate(); // Refresh data
            toast.success("Settings saved successfully");
        } catch (error) {
            toast.error("Failed to save settings");
            console.error(error);
        } finally {
            setSaving(false);
        }
    };

    const handleFlushCache = async () => {
        setFlushing(true);
        try {
            await flushCache();
            toast.success("Redis cache flushed successfully");
        } catch (error) {
            toast.error("Failed to flush cache");
            console.error(error);
        } finally {
            setFlushing(false);
        }
    };

    const navItems = [
        { id: "general", label: "General", icon: LayoutDashboard },
        { id: "security", label: "Security", icon: Lock },
        { id: "advanced", label: "Advanced", icon: SettingsIcon },
    ];

    return (
        <div className="space-y-6 pb-16 animate-fade-in">
            <div className="space-y-0.5">
                <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
                <p className="text-muted-foreground">
                    Manage your gateway configuration and workspace preferences.
                </p>
            </div>
            <Separator className="my-6" />
            <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
                <aside className="lg:w-64 shrink-0">
                    <nav className="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1">
                        {navItems.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => setActiveTab(item.id as SettingsTab)}
                                className={cn(
                                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent transition-colors text-left",
                                    activeTab === item.id
                                        ? "bg-accent text-accent-foreground"
                                        : "transparent text-muted-foreground hover:text-accent-foreground"
                                )}
                            >
                                <item.icon className="h-4 w-4" />
                                {item.label}
                            </button>
                        ))}
                    </nav>
                </aside>
                <div className="flex-1 lg:max-w-2xl">
                    {activeTab === "general" && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-lg font-medium">Gateway Information</h3>
                                <p className="text-sm text-muted-foreground">
                                    Basic identification for this gateway instance.
                                </p>
                            </div>
                            <Separator />
                            <div className="grid gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="gateway-name">Gateway Name</Label>
                                    <p className="text-[0.8rem] text-muted-foreground">
                                        This is the name that will be displayed in the dashboard and emails.
                                    </p>
                                    <Input
                                        id="gateway-name"
                                        value={gatewayName}
                                        onChange={(e) => setGatewayName(e.target.value)}
                                        className="max-w-md"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="admin-email">Admin Email</Label>
                                    <p className="text-[0.8rem] text-muted-foreground">
                                        The primary contact email for system alerts.
                                    </p>
                                    <Input
                                        id="admin-email"
                                        type="email"
                                        value={adminEmail}
                                        onChange={(e) => setAdminEmail(e.target.value)}
                                        className="max-w-md"
                                    />
                                </div>
                            </div>

                            <div className="pt-4">
                                <h3 className="text-lg font-medium">Appearance</h3>
                                <p className="text-sm text-muted-foreground">
                                    Customize the dashboard theme.
                                </p>
                            </div>
                            <Separator />
                            <div className="grid gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="theme">Theme</Label>
                                    <p className="text-[0.8rem] text-muted-foreground">
                                        Select the color theme for the dashboard.
                                    </p>
                                    <div className="max-w-md">
                                        <Select value={theme} onValueChange={setTheme}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select theme" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="light">
                                                    <div className="flex items-center gap-2">
                                                        <Sun className="h-4 w-4" /> Light
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="dark">
                                                    <div className="flex items-center gap-2">
                                                        <Moon className="h-4 w-4" /> Dark
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="system">
                                                    <div className="flex items-center gap-2">
                                                        <Laptop className="h-4 w-4" /> System
                                                    </div>
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4">
                                <h3 className="text-lg font-medium">Availability</h3>
                                <p className="text-sm text-muted-foreground">
                                    Control system-wide access.
                                </p>
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <Label className="text-base">Maintenance Mode</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Reject non-admin traffic with 503 Service Unavailable.
                                    </p>
                                </div>
                                <Switch
                                    checked={maintenanceMode}
                                    onCheckedChange={setMaintenanceMode}
                                />
                            </div>

                            <div className="flex justify-end pt-4">
                                <Button onClick={handleSave} disabled={saving}>
                                    {saving && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />}
                                    <Save className="mr-2 h-4 w-4" />
                                    Save Changes
                                </Button>
                            </div>
                        </div>
                    )}

                    {activeTab === "security" && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-lg font-medium">Security Policies</h3>
                                <p className="text-sm text-muted-foreground">
                                    Manage access controls and authentication requirements.
                                </p>
                            </div>
                            <Separator />
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Two-Factor Authentication</CardTitle>
                                    <CardDescription>
                                        Require 2FA for all administrative actions.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center space-x-2">
                                        <div className="flex-1">
                                            <p className="text-sm font-medium">Enforce 2FA</p>
                                            <p className="text-sm text-muted-foreground">
                                                Currently disabled globally.
                                            </p>
                                        </div>
                                        <Switch disabled />
                                    </div>
                                    <div className="mt-4 flex items-center gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
                                        <Shield className="h-4 w-4 text-blue-500" />
                                        <span>This feature is coming in a future update.</span>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {activeTab === "advanced" && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-lg font-medium text-destructive">Danger Zone</h3>
                                <p className="text-sm text-muted-foreground">
                                    Irreversible and sensitive actions.
                                </p>
                            </div>
                            <Separator className="bg-destructive/20" />

                            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <div className="font-medium text-destructive flex items-center gap-2">
                                            <RefreshCw className="h-4 w-4" />
                                            Flush Redis Cache
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            Clear all cached responses and rate limit counters.
                                        </p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="border-destructive/50 text-destructive hover:bg-destructive/10"
                                        onClick={handleFlushCache}
                                        disabled={flushing}
                                    >
                                        {flushing ? "Flushing..." : "Flush Cache"}
                                    </Button>
                                </div>
                            </div>

                            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <div className="font-medium text-destructive flex items-center gap-2">
                                            <Trash2 className="h-4 w-4" />
                                            Factory Reset
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            Delete all data, keys, and logs. This cannot be undone.
                                        </p>
                                    </div>
                                    <Button variant="destructive" size="sm" disabled>
                                        Reset Gateway
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

