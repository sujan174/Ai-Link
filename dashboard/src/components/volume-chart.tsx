"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getRequestVolume, VolumeStat } from "@/lib/api";
import { format, parseISO } from "date-fns";

export function VolumeChart() {
    const [data, setData] = useState<{ name: string; requests: number }[]>([]);

    useEffect(() => {
        getRequestVolume().then(volume => {
            // Fill in missing hours if necessary, but for now just map existing
            const formatted = volume.map((v: VolumeStat) => ({
                name: format(parseISO(v.bucket), "HH:mm"),
                requests: v.count
            }));
            setData(formatted);
        }).catch(err => console.error("Failed to fetch volume", err));
    }, []);

    return (
        <Card className="col-span-4">
            <CardHeader>
                <CardTitle>Request Volume (24h)</CardTitle>
            </CardHeader>
            <CardContent className="pl-2">
                <ResponsiveContainer width="100%" height={350}>
                    <AreaChart data={data}>
                        <XAxis
                            dataKey="name"
                            stroke="#888888"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis
                            stroke="#888888"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => `${value}`}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: 'var(--card)', borderRadius: '8px', border: '1px solid var(--border)' }}
                            itemStyle={{ color: 'var(--foreground)' }}
                        />
                        <Area
                            type="monotone"
                            dataKey="requests"
                            stroke="var(--primary)"
                            fill="var(--primary)"
                            fillOpacity={0.2}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}
