"use client";

import { useState, useEffect, useCallback } from "react";
import {
  listTokens,
  createToken,
  revokeToken,
  listCredentials,
  Token,
  Credential,
  CreateTokenRequest
} from "@/lib/api";
import {
  Plus, RefreshCw, Key, Shield, Trash2, Loader2, AlertTriangle, Blocks
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { PageSkeleton } from "@/components/page-skeleton";
import { useRouter } from "next/navigation";
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
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function TokensPage() {
  const router = useRouter();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeTokenData, setRevokeTokenData] = useState<Token | null>(null);

  const fetchTokens = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listTokens();
      // Sort active first, then by date
      const sorted = data.sort((a, b) => {
        if (a.is_active && !b.is_active) return -1;
        if (!a.is_active && b.is_active) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      setTokens(sorted);
    } catch {
      toast.error("Failed to load tokens");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const handleRevoke = async () => {
    if (!revokeTokenData) return;
    try {
      await revokeToken(revokeTokenData.id);
      toast.success("Token revoked successfully");
      setRevokeTokenData(null);
      fetchTokens();
    } catch {
      toast.error("Failed to revoke token");
    }
  };

  const activeCount = tokens.filter((t) => t.is_active).length;
  const revokedCount = tokens.length - activeCount;

  return (
    <div className="p-8 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">Tokens</h2>
          <p className="text-muted-foreground text-sm">
            Virtual API tokens for agent authentication and policy enforcement
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchTokens} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
            Refresh
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Create Token
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
              <CreateTokenForm onSuccess={() => {
                setCreateOpen(false);
                fetchTokens();
              }} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI Cards */}
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
        <Card className={cn("glass-card hover-lift p-4", activeCount > 0 && "animate-glow border-emerald-500/30")}>
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

      {/* Table */}
      {loading ? (
        <PageSkeleton cards={3} rows={5} />
      ) : tokens.length === 0 ? (
        <EmptyState
          icon={Key}
          title="No tokens created"
          description="Create a virtual token to give your agents controlled access to upstream APIs."
          actionLabel="Create Token"
          onAction={() => setCreateOpen(true)}
          className="bg-card/50 backdrop-blur-sm"
        />
      ) : (
        <div className="animate-slide-up stagger-2">
          <DataTable
            columns={columns}
            data={tokens}
            searchKey="name"
            searchPlaceholder="Filter tokens..."
            onRowClick={(token) => router.push(`/tokens/${token.id}`)}
            meta={{
              onRevoke: (t: Token) => setRevokeTokenData(t),
            }}
          />
        </div>
      )}

      {/* Revoke Confirmation Dialog */}
      <Dialog open={!!revokeTokenData} onOpenChange={(open) => !open && setRevokeTokenData(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Revoke Token
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to revoke the token <span className="font-mono font-medium text-foreground">{revokeTokenData?.name}</span>?
              This action cannot be undone and any agents using this token will effectively stop working.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTokenData(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRevoke}>Revoke Token</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Create Token Form ─────────────────────────────

function CreateTokenForm({ onSuccess }: { onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [fetchingCreds, setFetchingCreds] = useState(true);

  const [formData, setFormData] = useState<CreateTokenRequest>({
    name: "",
    credential_id: "",
    upstream_url: "https://api.openai.com/v1", // Default good DX
  });

  useEffect(() => {
    listCredentials()
      .then(setCredentials)
      .catch(() => toast.error("Failed to load credentials"))
      .finally(() => setFetchingCreds(false));
  }, []);

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
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-xs">
            Token Name
          </Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. billing-agent-v1"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="upstream" className="text-xs">
            Upstream API URL
          </Label>
          <Input
            id="upstream"
            value={formData.upstream_url}
            onChange={(e) => setFormData({ ...formData, upstream_url: e.target.value })}
            placeholder="https://api.openai.com/v1"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cred_id" className="text-xs">
            Backing Credential
          </Label>
          {fetchingCreds ? (
            <div className="h-10 w-full animate-pulse bg-muted rounded-md" />
          ) : (
            <Select
              value={formData.credential_id}
              onChange={(e) => setFormData({ ...formData, credential_id: e.target.value })}
              required
            >
              <option value="" disabled>Select a credential...</option>
              {credentials.filter(c => c.is_active).map((cred) => (
                <option key={cred.id} value={cred.id}>
                  {cred.name} ({cred.provider})
                </option>
              ))}
            </Select>
          )}
          {credentials.length === 0 && !fetchingCreds && (
            <p className="text-[10px] text-muted-foreground mt-1">
              No active credentials found. Create one first.
            </p>
          )}
        </div>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" type="button">Cancel</Button>
        </DialogClose>
        <Button type="submit" disabled={loading || !formData.credential_id}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {loading ? "Creating..." : "Create Token"}
        </Button>
      </DialogFooter>
    </form>
  );
}
