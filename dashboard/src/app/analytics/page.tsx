"use client";

import { useState } from "react";
import useSWR from "swr";
import { swrFetcher, AnalyticsSummary, AnalyticsTimeseriesPoint } from "@/lib/api";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area,
    LineChart,
    Line
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, DollarSign, Clock, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AnalyticsPage() {
    const [range, setRange] = useState("24"); // hours

    // Fetch Summary
    const { data: summary, isLoading: loadingSummary } = useSWR<AnalyticsSummary>(
        `/analytics/summary?range=${range}`,
        swrFetcher
    );

    // Fetch Timeseries
    const { data: timeseries, isLoading: loadingTimeseries } = useSWR<AnalyticsTimeseriesPoint[]>(
        `/analytics/timeseries?range=${range}`,
        swrFetcher
    );

    // Formatters
    const formatCost = (val: number) => `$${val.toFixed(4)}`;
    const formatLatency = (val: number) => `${Math.round(val)}ms`;
    const formatNumber = (val: number) => new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(val);
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return range === "24"
            ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric' });
    };

    return (
        <div className="space-y-6 pb-20 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h2 className="text-3xl font-bold tracking-tight">Analytics</h2>
                    <p className="text-muted-foreground">
                        Global traffic and performance metrics.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={range} onValueChange={setRange}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Select range" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1">Last Hour</SelectItem>
                            <SelectItem value="24">Last 24 Hours</SelectItem>
                            <SelectItem value="168">Last 7 Days</SelectItem>
                            <SelectItem value="720">Last 30 Days</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KPICard
                    title="Total Requests"
                    value={summary ? formatNumber(summary.total_requests) : undefined}
                    loading={loadingSummary}
                    icon={Activity}
                    intent="neutral"
                />
                <KPICard
                    title="Error Rate"
                    value={summary ? `${((summary.error_count / (summary.total_requests || 1)) * 100).toFixed(2)}%` : undefined}
                    loading={loadingSummary}
                    icon={Zap}
                    intent={summary && (summary.error_count / (summary.total_requests || 1)) > 0.01 ? "danger" : "success"}
                    subtext={summary ? `${summary.error_count} errors` : undefined}
                />
                <KPICard
                    title="Avg Latency"
                    value={summary ? formatLatency(summary.avg_latency) : undefined}
                    loading={loadingSummary}
                    icon={Clock}
                    intent={summary && summary.avg_latency > 500 ? "warning" : "neutral"}
                />
                <KPICard
                    title="Total Cost"
                    value={summary ? formatCost(summary.total_cost) : undefined}
                    loading={loadingSummary}
                    icon={DollarSign}
                    intent="neutral"
                    subtext={summary ? `${formatNumber(summary.total_tokens)} tokens` : undefined}
                />
            </div>

            {/* Charts */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                {/* Main Volume Chart */}
                <Card className="col-span-4 glass-card">
                    <CardHeader>
                        <CardTitle>Request Volume</CardTitle>
                        <CardDescription>
                            Total requests and errors over time.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <div className="h-[350px] w-full">
                            {loadingTimeseries ? (
                                <Skeleton className="h-full w-full" />
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={timeseries}>
                                        <defs>
                                            <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#8884d8" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis
                                            dataKey="bucket"
                                            tickFormatter={formatDate}
                                            stroke="#888888"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            minTickGap={30}
                                        />
                                        <YAxis
                                            stroke="#888888"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(value) => `${value}`}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'rgba(23, 23, 23, 0.9)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}
                                            labelFormatter={formatDate}
                                        />
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                        <Area
                                            type="monotone"
                                            dataKey="request_count"
                                            stroke="#8884d8"
                                            fillOpacity={1}
                                            fill="url(#colorRequests)"
                                            name="Requests"
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="error_count"
                                            stroke="#ef4444"
                                            fill="#ef4444"
                                            fillOpacity={0.2}
                                            name="Errors"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Latency & Cost */}
                <Card className="col-span-3 glass-card">
                    <CardHeader>
                        <CardTitle>Latency & Cost</CardTitle>
                        <CardDescription>
                            Performance vs. Spend correlation.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <div className="h-[350px] w-full">
                            {loadingTimeseries ? (
                                <Skeleton className="h-full w-full" />
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={timeseries}>
                                        <XAxis
                                            dataKey="bucket"
                                            tickFormatter={formatDate}
                                            stroke="#888888"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            minTickGap={30}
                                        />
                                        <YAxis
                                            yAxisId="left"
                                            stroke="#888888"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(val) => `${val}ms`}
                                        />
                                        <YAxis
                                            yAxisId="right"
                                            orientation="right"
                                            stroke="#888888"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(val) => `$${val}`}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'rgba(23, 23, 23, 0.9)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}
                                            labelFormatter={formatDate}
                                        />
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                        <Line
                                            yAxisId="left"
                                            type="monotone"
                                            dataKey="lat"
                                            stroke="#22c55e"
                                            strokeWidth={2}
                                            dot={false}
                                            name="Latency (ms)"
                                        />
                                        <Line
                                            yAxisId="right"
                                            type="monotone"
                                            dataKey="cost"
                                            stroke="#eab308"
                                            strokeWidth={2}
                                            dot={false}
                                            name="Cost ($)"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function KPICard({
    title,
    value,
    loading,
    icon: Icon,
    intent = "neutral",
    subtext
}: {
    title: string;
    value?: string | number;
    loading?: boolean;
    icon: any;
    intent?: "neutral" | "success" | "warning" | "danger";
    subtext?: string;
}) {
    return (
        <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                    {title}
                </CardTitle>
                <Icon className={cn(
                    "h-4 w-4",
                    intent === "neutral" && "text-muted-foreground",
                    intent === "success" && "text-emerald-500",
                    intent === "warning" && "text-amber-500",
                    intent === "danger" && "text-rose-500",
                )} />
            </CardHeader>
            <CardContent>
                {loading ? (
                    <Skeleton className="h-7 w-20" />
                ) : (
                    <div className="space-y-1">
                        <div className="text-2xl font-bold font-mono">{value ?? "—"}</div>
                        {subtext && (
                            <p className="text-xs text-muted-foreground">
                                {subtext}
                            </p>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
