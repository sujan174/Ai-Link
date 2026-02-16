"use client";

import { useState, useEffect, useCallback } from "react";
import { listTokens, createToken, Token, CreateTokenRequest } from "@/lib/api";
import { Plus, RefreshCw, Key, Shield, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { columns } from "./columns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function TokensPage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const fetchTokens = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listTokens();
      setTokens(data);
    } catch {
      toast.error("Failed to load tokens");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const activeCount = tokens.filter((t) => t.is_active).length;
  const revokedCount = tokens.length - activeCount;

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between animate-fade-in">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">Tokens</h2>
          <p className="text-muted-foreground">
            Virtual API tokens for agent authentication
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchTokens} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Create Token
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <CreateTokenForm onSuccess={() => {
                setOpen(false);
                fetchTokens();
              }} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 animate-slide-up">
        <Card className="glass-card hover-lift p-4">
          <div className="flex items-center gap-3">
            <div className="icon-circle-blue">
              <Key className="h-4 w-4" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{tokens.length}</p>
              <p className="text-xs text-muted-foreground">Total Tokens</p>
            </div>
          </div>
        </Card>
        <Card className="glass-card hover-lift p-4">
          <div className="flex items-center gap-3">
            <div className="icon-circle-emerald">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums text-emerald-500">{activeCount}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </div>
        </Card>
        <Card className="glass-card hover-lift p-4">
          <div className="flex items-center gap-3">
            <div className="icon-circle-rose">
              <Trash2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums text-rose-500">{revokedCount}</p>
              <p className="text-xs text-muted-foreground">Revoked</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="animate-slide-up stagger-2">
        <DataTable columns={columns} data={tokens} searchKey="name" />
      </div>
    </div>
  );
}

function CreateTokenForm({ onSuccess }: { onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<CreateTokenRequest>({
    name: "",
    credential_id: "",
    upstream_url: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await createToken(formData);
      toast.success("Token created successfully");
      onSuccess();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create token");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Create Token</DialogTitle>
        <DialogDescription>
          Issue a new virtual token mapping to a credential.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="name" className="text-right">
            Name
          </Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="col-span-3"
            placeholder="e.g. billing-agent-v1"
            required
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="upstream" className="text-right">
            Upstream
          </Label>
          <Input
            id="upstream"
            value={formData.upstream_url}
            onChange={(e) => setFormData({ ...formData, upstream_url: e.target.value })}
            className="col-span-3"
            placeholder="https://api.openai.com/v1"
            required
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="cred_id" className="text-right">
            Credential ID
          </Label>
          <Input
            id="cred_id"
            value={formData.credential_id}
            onChange={(e) => setFormData({ ...formData, credential_id: e.target.value })}
            className="col-span-3"
            placeholder="UUID of credential"
            required
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create Token"}
        </Button>
      </DialogFooter>
    </form>
  );
}
