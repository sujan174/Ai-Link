"use client";

import { useState } from "react";
import { Plus, Mail, Shield, User, X, Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Mock Data
const INITIAL_MEMBERS = [
    { id: "1", name: "Sujan (You)", email: "sujan@ailink.dev", role: "Owner", avatar: "SJ" },
    { id: "2", name: "Engineering Team", email: "eng@ailink.dev", role: "Admin", avatar: "EN" },
    { id: "3", name: "Demo User", email: "demo@ailink.dev", role: "Viewer", avatar: "DU" },
];

export default function TeamPage() {
    const [members, setMembers] = useState(INITIAL_MEMBERS);
    const [showInvite, setShowInvite] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState("Viewer");
    const [loading, setLoading] = useState(false);

    const handleInvite = async () => {
        setLoading(true);
        // Simulate API
        await new Promise(r => setTimeout(r, 600));

        const newMember = {
            id: Math.random().toString(36).substr(2, 9),
            name: inviteEmail.split("@")[0],
            email: inviteEmail,
            role: inviteRole,
            avatar: inviteEmail.substring(0, 2).toUpperCase()
        };

        setMembers([...members, newMember]);
        setLoading(false);
        setShowInvite(false);
        setInviteEmail("");
        toast.success(`Invitation sent to ${inviteEmail}`);
    };

    const removeMember = (id: string) => {
        setMembers(members.filter(m => m.id !== id));
        toast.info("Member removed from organization");
    };

    return (
        <div className="p-4 space-y-6 max-w-[1200px] mx-auto animate-fade-in">
            {/* Controls */}
            <div className="flex items-center justify-end mb-2">
                <Button onClick={() => setShowInvite(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Invite Member
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Organization Members</CardTitle>
                            <CardDescription>
                                People with access to the AILink Gateway.
                            </CardDescription>
                        </div>
                        <div className="relative w-[250px]">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Filter members..." className="pl-9" />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {members.map((member) => (
                            <div key={member.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors group">
                                <div className="flex items-center gap-4">
                                    <Avatar>
                                        <AvatarImage src="" />
                                        <AvatarFallback className="bg-primary/10 text-primary font-medium">
                                            {member.avatar}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="text-sm font-medium leading-none flex items-center gap-2">
                                            {member.name}
                                            {member.role === "Owner" && (
                                                <Badge variant="secondary" className="text-[10px] h-5">Owner</Badge>
                                            )}
                                        </p>
                                        <p className="text-[13px] text-muted-foreground">{member.email}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center text-[13px] text-muted-foreground">
                                        {member.role === "Owner" ? <Shield className="h-4 w-4 mr-1.5" /> : <User className="h-4 w-4 mr-1.5" />}
                                        {member.role}
                                    </div>
                                    {member.role !== "Owner" && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-muted-foreground hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                                            onClick={() => removeMember(member.id)}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Dialog open={showInvite} onOpenChange={setShowInvite}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Invite Team Member</DialogTitle>
                        <DialogDescription>
                            Send an invitation to join your organization.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Email Address</Label>
                            <Input
                                placeholder="colleague@example.com"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Role</Label>
                            <Select
                                value={inviteRole}
                                onValueChange={setInviteRole}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a role" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Admin">Admin</SelectItem>
                                    <SelectItem value="Developer">Developer</SelectItem>
                                    <SelectItem value="Viewer">Viewer</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-[12px] text-muted-foreground">
                                {inviteRole === "Admin" ? "Full access to all resources and settings." :
                                    inviteRole === "Developer" ? "Can manage services, tokens, and debug traces." :
                                        "Read-only access to analytics and logs."}
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
                        <Button onClick={handleInvite} disabled={loading || !inviteEmail}>
                            {loading && <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2" />}
                            Send Invitation
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
