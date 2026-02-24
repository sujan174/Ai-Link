"use client";

import { Activity, Map, DollarSign } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RoutingTab from "./routing-tab";
import AliasesTab from "./aliases-tab";
import PricingTab from "./pricing-tab";

export default function UnifiedUpstreamsPage() {
    return (
        <div className="space-y-4 max-w-[1600px] mx-auto min-h-[calc(100vh-4rem)]">
            <Tabs defaultValue="routing" className="w-full animate-slide-up mt-2">
                <TabsList className="mb-6 grid w-[400px] grid-cols-3 border border-border/50">
                    <TabsTrigger value="routing" className="gap-2 text-xs font-semibold">
                        <Activity className="h-3.5 w-3.5" />
                        Status
                    </TabsTrigger>
                    <TabsTrigger value="aliases" className="gap-2 text-xs font-semibold">
                        <Map className="h-3.5 w-3.5" />
                        Aliases
                    </TabsTrigger>
                    <TabsTrigger value="pricing" className="gap-2 text-xs font-semibold">
                        <DollarSign className="h-3.5 w-3.5" />
                        Pricing
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="routing" className="mt-0 outline-none">
                    <RoutingTab />
                </TabsContent>

                <TabsContent value="aliases" className="mt-0 outline-none">
                    <AliasesTab />
                </TabsContent>

                <TabsContent value="pricing" className="mt-0 outline-none">
                    <PricingTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
