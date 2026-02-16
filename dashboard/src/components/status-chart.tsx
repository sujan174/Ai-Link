"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { getStatusDistribution, StatusStat } from "@/lib/api";

const COLORS = {
    "200": "var(--chart-1, #10b981)",
    "400": "var(--chart-2, #f59e0b)",
    "500": "var(--chart-3, #ef4444)",
};

const DEFAULT_COLOR = "#8884d8";

export function StatusPieChart() {
    const [data, setData] = useState<{ name: string; value: number; fill: string }[]>([]);

    useEffect(() => {
        getStatusDistribution().then(stats => {
            const formatted = stats.map((s: StatusStat) => {
                const name = `${s.status_class}xx`;
                return {
                    name,
                    value: s.count,
                    fill: COLORS[s.status_class.toString() as keyof typeof COLORS] || DEFAULT_COLOR
                };
            });
            setData(formatted);
        }).catch(err => console.error("Failed to fetch status distribution", err));
    }, []);

    return (
        <Card className="col-span-1">
            <CardHeader>
                <CardTitle>Status Codes (24h)</CardTitle>
            </CardHeader>
            <CardContent className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                    </PieChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}
