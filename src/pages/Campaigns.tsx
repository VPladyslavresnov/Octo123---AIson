import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Megaphone, Plus, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { CampaignMenu } from "@/components/campaign/CampaignMenu";

type CampaignRow = {
  id: string;
  objective: string | null;
  tone: string | null;
  channels: string[] | null;
  duration_days: number | null;
  posting_cadence_per_week: number | null;
  status: string | null;
  created_at: string | null;
  content_mix: {
    goal?: string;
  } | null;
};

export default function Campaigns() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    checkAuthAndLoadCampaigns();
  }, []);

  const checkAuthAndLoadCampaigns = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    loadCampaigns();
  };

  const loadCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCampaigns((data as CampaignRow[]) || []);
    } catch {
      toast.error("Something went wrong loading your campaigns. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((campaign) => {
      const matchesSearch =
        !search.trim() ||
        (campaign.objective || "").toLowerCase().includes(search.toLowerCase()) ||
        (campaign.content_mix?.goal || "").toLowerCase().includes(search.toLowerCase());

      const matchesStatus = statusFilter === "all" || (campaign.status || "draft") === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [campaigns, search, statusFilter]);

  const statusTone = (status: string | null) => {
    switch (status) {
      case "active":
        return "bg-emerald-500/10 text-emerald-600";
      case "paused":
        return "bg-amber-500/10 text-amber-600";
      case "draft":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-primary/10 text-primary";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-primary/10">
                <Megaphone className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Campaigns</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Organize campaigns in a list view with faster filtering and review.
                </p>
              </div>
            </div>
            <Button onClick={() => navigate("/campaign/new")}>
              <Plus className="w-4 h-4 mr-2" />
              New Campaign
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <Card className="p-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
              <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search campaigns or goals"
                  className="pl-9"
                />
              </div>
              <Button
                variant={statusFilter === "all" ? "default" : "outline"}
                onClick={() => setStatusFilter("all")}
              >
                All statuses
              </Button>
              <div className="flex gap-2 flex-wrap">
                {["draft", "active", "paused"].map((status) => (
                  <Button
                    key={status}
                    variant={statusFilter === status ? "default" : "outline"}
                    onClick={() => setStatusFilter(status)}
                    className="capitalize"
                  >
                    {status}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <SlidersHorizontal className="w-4 h-4" />
              {filteredCampaigns.length} shown
            </div>
          </div>
        </Card>

        {loading ? (
          <div className="text-center py-16">
            <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="mt-4 text-muted-foreground">Loading campaigns...</p>
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <Card className="p-12 text-center border-dashed">
            <h2 className="text-2xl font-semibold mb-3 text-foreground">No campaigns yet</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Start your first campaign to give AIson a clear brief and an execution plan.
            </p>
            <Button onClick={() => navigate("/campaign/new")}>
              <Plus className="w-4 h-4 mr-2" />
              Create campaign
            </Button>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead className="bg-muted/40">
                  <tr className="text-left text-sm text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Campaign</th>
                    <th className="px-4 py-3 font-medium">Goal</th>
                    <th className="px-4 py-3 font-medium">Channels</th>
                    <th className="px-4 py-3 font-medium">Cadence</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCampaigns.map((campaign) => (
                    <tr
                      key={campaign.id}
                      className="border-t border-border hover:bg-muted/20 cursor-pointer"
                      onClick={() => navigate(`/campaign/${campaign.id}`)}
                    >
                      <td className="px-4 py-4">
                        <div>
                          <p className="font-medium text-foreground">{campaign.objective || "Untitled campaign"}</p>
                          <p className="text-sm text-muted-foreground mt-1 capitalize">
                            {campaign.tone || "Professional"} tone
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-foreground capitalize">
                        {campaign.content_mix?.goal || "Not set"}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex gap-2 flex-wrap">
                          {(campaign.channels || []).length > 0 ? (
                            campaign.channels?.map((channel) => (
                              <Badge key={channel} variant="secondary" className="capitalize">
                                {channel}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground">No channels</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-foreground">
                        {campaign.posting_cadence_per_week || 0}/week for {campaign.duration_days || 30} days
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusTone(campaign.status)}`}>
                          {campaign.status || "draft"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        {campaign.created_at ? new Date(campaign.created_at).toLocaleDateString() : "Unknown"}
                      </td>
                      <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <CampaignMenu campaign={campaign} onUpdate={loadCampaigns} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
