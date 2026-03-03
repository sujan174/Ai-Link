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
    Laptop,
    Palette,
    Server,
    Wrench,
    Bell,
    Monitor,
    Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getSettings, updateSettings, flushCache, swrFetcher, SystemSettings } from "@/lib/api";
import { cn } from "@/lib/utils";

type SettingsTab = "general" | "security" | "advanced";

const tabs = [
    { id: "general" as const, label: "General", icon: LayoutDashboard, description: "Gateway identity & appearance" },
    { id: "security" as const, label: "Security", icon: Lock, description: "Auth & access policies" },
    { id: "advanced" as const, label: "Advanced", icon: Wrench, description: "Danger zone & cache" },
];

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
            await mutate();
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

    const themeOptions = [
        { value: "light", label: "Light", icon: Sun, desc: "Clean light surfaces" },
        { value: "dark", label: "Dark", icon: Moon, desc: "Easy on the eyes" },
        { value: "system", label: "System", icon: Monitor, desc: "Match OS preference" },
    ];

    return (
        <div className="space-y-6 max-w-4xl pb-20 animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Manage your gateway configuration and workspace preferences.
                </p>
            </div>

            <div className="flex flex-col space-y-6 lg:flex-row lg:space-x-8 lg:space-y-0">
                {/* Side nav */}
                <aside className="lg:w-56 shrink-0">
                    <nav className="flex lg:flex-col gap-1">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "flex items-center gap-3 rounded-lg px-3 py-3 text-left transition-all duration-150 w-full group",
                                    activeTab === tab.id
                                        ? "bg-primary/8 border border-primary/15 text-foreground"
                                        : "border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                )}
                            >
                                <div className={cn(
                                    "flex h-8 w-8 items-center justify-center rounded-md transition-colors shrink-0",
                                    activeTab === tab.id
                                        ? "bg-primary/10 text-primary"
                                        : "bg-muted text-muted-foreground group-hover:text-foreground"
                                )}>
                                    <tab.icon className="h-4 w-4" />
                                </div>
                                <div className="hidden lg:block min-w-0">
                                    <p className="text-sm font-medium leading-none">{tab.label}</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{tab.description}</p>
                                </div>
                            </button>
                        ))}
                    </nav>
                </aside>

                {/* Content */}
                <div className="flex-1 space-y-6">
                    {activeTab === "general" && (
                        <>
                            {/* Gateway Identity */}
                            <Card className="border-border/60 bg-card/80">
                                <CardHeader className="pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                                            <Server className="h-4.5 w-4.5 text-primary" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-base">Gateway Identity</CardTitle>
                                            <CardDescription className="text-xs">
                                                Name and contact for this gateway instance
                                            </CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="gateway-name" className="text-xs font-medium">Gateway Name</Label>
                                        <Input
                                            id="gateway-name"
                                            value={gatewayName}
                                            onChange={(e) => setGatewayName(e.target.value)}
                                            placeholder="My Gateway"
                                            className="max-w-md"
                                        />
                                        <p className="text-[11px] text-muted-foreground">
                                            Displayed in the dashboard header and system emails.
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="admin-email" className="text-xs font-medium">Admin Email</Label>
                                        <Input
                                            id="admin-email"
                                            type="email"
                                            value={adminEmail}
                                            onChange={(e) => setAdminEmail(e.target.value)}
                                            placeholder="admin@company.com"
                                            className="max-w-md"
                                        />
                                        <p className="text-[11px] text-muted-foreground">
                                            Primary contact for alerts, anomalies, and spend cap warnings.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Appearance */}
                            <Card className="border-border/60 bg-card/80">
                                <CardHeader className="pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10">
                                            <Palette className="h-4.5 w-4.5 text-violet-500" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-base">Appearance</CardTitle>
                                            <CardDescription className="text-xs">
                                                Choose how the dashboard looks
                                            </CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-3 gap-3">
                                        {themeOptions.map((opt) => (
                                            <button
                                                key={opt.value}
                                                onClick={() => setTheme(opt.value)}
                                                className={cn(
                                                    "relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all duration-150",
                                                    theme === opt.value
                                                        ? "border-primary bg-primary/5 shadow-sm"
                                                        : "border-border/60 bg-card/50 hover:border-border hover:bg-muted/30"
                                                )}
                                            >
                                                {theme === opt.value && (
                                                    <div className="absolute top-2 right-2">
                                                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                                                    </div>
                                                )}
                                                <div className={cn(
                                                    "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                                                    theme === opt.value
                                                        ? "bg-primary/10 text-primary"
                                                        : "bg-muted text-muted-foreground"
                                                )}>
                                                    <opt.icon className="h-5 w-5" />
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-sm font-medium">{opt.label}</p>
                                                    <p className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Availability */}
                            <Card className="border-border/60 bg-card/80">
                                <CardHeader className="pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
                                            <Zap className="h-4.5 w-4.5 text-amber-500" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-base">Availability</CardTitle>
                                            <CardDescription className="text-xs">
                                                Control gateway access for all non-admin traffic
                                            </CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-4 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "flex h-8 w-8 items-center justify-center rounded-md",
                                                maintenanceMode
                                                    ? "bg-amber-500/10 text-amber-500"
                                                    : "bg-emerald-500/10 text-emerald-500"
                                            )}>
                                                {maintenanceMode
                                                    ? <AlertTriangle className="h-4 w-4" />
                                                    : <CheckCircle2 className="h-4 w-4" />
                                                }
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">Maintenance Mode</p>
                                                <p className="text-[11px] text-muted-foreground">
                                                    {maintenanceMode
                                                        ? "All non-admin traffic returns 503 Service Unavailable"
                                                        : "Gateway is accepting all traffic normally"
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                        <Switch
                                            checked={maintenanceMode}
                                            onCheckedChange={setMaintenanceMode}
                                        />
                                    </div>
                                    {maintenanceMode && (
                                        <div className="mt-3 rounded-md bg-amber-500/5 border border-amber-500/15 px-3 py-2 text-[11px] text-amber-500 flex items-center gap-2">
                                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                            <span>Remember to save changes below to activate maintenance mode.</span>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Save */}
                            <div className="flex justify-end">
                                <Button onClick={handleSave} disabled={saving} className="gap-2 min-w-[140px]">
                                    {saving ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                    ) : (
                                        <Save className="h-4 w-4" />
                                    )}
                                    {saving ? "Saving..." : "Save Changes"}
                                </Button>
                            </div>
                        </>
                    )}

                    {activeTab === "security" && (
                        <>
                            <Card className="border-border/60 bg-card/80">
                                <CardHeader className="pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                                            <Shield className="h-4.5 w-4.5 text-blue-500" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-base">Two-Factor Authentication</CardTitle>
                                            <CardDescription className="text-xs">
                                                Require 2FA for all administrative actions
                                            </CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-4 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                                <Lock className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">Enforce 2FA</p>
                                                <p className="text-[11px] text-muted-foreground">
                                                    Currently disabled globally
                                                </p>
                                            </div>
                                        </div>
                                        <Switch disabled />
                                    </div>
                                    <div className="flex items-start gap-3 rounded-lg bg-blue-500/5 border border-blue-500/15 px-4 py-3">
                                        <Shield className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-xs font-medium text-blue-500">Coming Soon</p>
                                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                                Two-factor authentication enforcement will be available in a future release.
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-border/60 bg-card/80">
                                <CardHeader className="pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                                            <Bell className="h-4.5 w-4.5 text-emerald-500" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-base">Security Notifications</CardTitle>
                                            <CardDescription className="text-xs">
                                                Get alerted on suspicious activity
                                            </CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {[
                                            { label: "Anomaly alerts", desc: "High error rates or unusual traffic", enabled: true },
                                            { label: "Spend cap warnings", desc: "80% and 100% threshold emails", enabled: true },
                                            { label: "Login notifications", desc: "Email on new device login", enabled: false },
                                        ].map((item) => (
                                            <div key={item.label} className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
                                                <div>
                                                    <p className="text-sm font-medium">{item.label}</p>
                                                    <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                                                </div>
                                                <Switch checked={item.enabled} disabled />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-3 flex items-start gap-3 rounded-lg bg-blue-500/5 border border-blue-500/15 px-4 py-3">
                                        <Shield className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                                        <p className="text-[11px] text-muted-foreground">
                                            Notification preferences are read-only in this release. Full control coming soon.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </>
                    )}

                    {activeTab === "advanced" && (
                        <>
                            <div className="flex items-center gap-2 text-destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <h3 className="text-base font-semibold">Danger Zone</h3>
                            </div>
                            <p className="text-xs text-muted-foreground -mt-3">
                                Irreversible and destructive actions. Proceed with extreme caution.
                            </p>

                            <Card className="border-destructive/20 bg-destructive/[0.02]">
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-6">
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 shrink-0 mt-0.5">
                                                <RefreshCw className="h-4 w-4 text-destructive" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-destructive">Flush Redis Cache</p>
                                                <p className="text-[11px] text-muted-foreground mt-0.5 max-w-md">
                                                    Clears all cached LLM responses, rate limit counters, and session state from Redis.
                                                    Active sessions may experience brief latency spikes.
                                                </p>
                                            </div>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="border-destructive/30 text-destructive hover:bg-destructive/10 shrink-0"
                                            onClick={handleFlushCache}
                                            disabled={flushing}
                                        >
                                            {flushing ? (
                                                <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-destructive mr-2" />
                                            ) : (
                                                <RefreshCw className="h-3.5 w-3.5 mr-2" />
                                            )}
                                            {flushing ? "Flushing..." : "Flush Cache"}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-destructive/20 bg-destructive/[0.02]">
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-6">
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 shrink-0 mt-0.5">
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-destructive">Factory Reset</p>
                                                <p className="text-[11px] text-muted-foreground mt-0.5 max-w-md">
                                                    Permanently delete all data — keys, tokens, audit logs, sessions, policies, and configuration.
                                                    This action is irreversible.
                                                </p>
                                                <Badge variant="outline" className="mt-2 text-[9px] border-destructive/20 text-destructive">
                                                    Not available in production
                                                </Badge>
                                            </div>
                                        </div>
                                        <Button variant="destructive" size="sm" disabled className="shrink-0">
                                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                                            Reset Gateway
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
