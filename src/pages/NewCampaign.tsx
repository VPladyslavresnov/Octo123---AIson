import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";

const STEPS = [
  { number: 1, label: "Campaign Basics" },
  { number: 2, label: "Channels & Cadence" },
  { number: 3, label: "Review & Launch" },
];

const goals = [
  { id: "awareness", label: "Brand awareness" },
  { id: "engagement", label: "Engagement" },
  { id: "traffic", label: "Website traffic" },
  { id: "leads", label: "Lead generation" },
  { id: "sales", label: "Sales and conversions" },
];

const tones = ["Professional", "Playful", "Premium", "Bold", "Educational"];
const availableChannels = ["instagram", "facebook", "linkedin", "twitter", "tiktok"];

export default function NewCampaign() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [campaignName, setCampaignName] = useState("");
  const [goal, setGoal] = useState("awareness");
  const [tone, setTone] = useState("Professional");
  const [channels, setChannels] = useState<string[]>(["instagram", "linkedin"]);
  const [durationDays, setDurationDays] = useState(30);
  const [cadence, setCadence] = useState(4);
  const [companyName, setCompanyName] = useState("");
  const [brandSourceUrl, setBrandSourceUrl] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadCompanyDetails();
  }, []);

  const loadCompanyDetails = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    const { data } = await supabase
      .from("company_details")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (data) {
      setCompanyName(data.company_name || "");
      setBrandSourceUrl(data.brand_source_url || data.website || "");
      setTargetAudience(data.target_audience || "");
    }
  };

  const toggleChannel = (channel: string) => {
    setChannels((prev) =>
      prev.includes(channel) ? prev.filter((item) => item !== channel) : [...prev, channel]
    );
  };

  const handleCreateCampaign = async () => {
    if (!campaignName.trim()) {
      toast.error("Campaign name is required");
      return;
    }

    if (channels.length === 0) {
      toast.error("Select at least one channel");
      return;
    }

    setIsCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data: campaign, error } = await supabase
        .from("campaigns")
        .insert({
          user_id: session.user.id,
          objective: campaignName.trim(),
          tone: tone.toLowerCase(),
          channels,
          duration_days: durationDays,
          posting_cadence_per_week: cadence,
          brand_source_url: brandSourceUrl || null,
          status: "draft",
          content_mix: {
            goal,
            companyName,
            targetAudience,
          },
          key_offers_or_topics: targetAudience ? [targetAudience] : [],
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("Campaign created successfully");
      navigate(`/campaign/${campaign.id}`);
    } catch {
      toast.error("Something went wrong saving your data. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const canProceedStep1 = campaignName.trim().length > 0;
  const canProceedStep2 = channels.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/campaigns")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="p-2.5 bg-primary/10 rounded-xl">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">New Campaign</h1>
              <p className="text-sm text-muted-foreground">
                Step {currentStep} of 3 — {STEPS[currentStep - 1].label}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="bg-card border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 mb-3">
            {STEPS.map((step, idx) => (
              <div key={step.number} className="flex items-center flex-1">
                <div
                  className={`flex items-center gap-2 text-sm font-medium ${
                    step.number === currentStep
                      ? "text-primary"
                      : step.number < currentStep
                        ? "text-emerald-500"
                        : "text-muted-foreground"
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      step.number < currentStep
                        ? "bg-emerald-500/15 text-emerald-500"
                        : step.number === currentStep
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step.number < currentStep ? <Check className="w-4 h-4" /> : step.number}
                  </span>
                  <span className="hidden sm:inline">{step.label}</span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 rounded ${step.number < currentStep ? "bg-emerald-500/40" : "bg-muted"}`} />
                )}
              </div>
            ))}
          </div>
          <Progress value={(currentStep / 3) * 100} className="h-1.5" />
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {currentStep === 1 && (
          <Card className="p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Campaign basics</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Start with the campaign information. Brand details are pulled from your saved profile instead of asking for them again.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="campaignName">Campaign name</Label>
              <Input
                id="campaignName"
                placeholder="Q2 Product Launch"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Campaign goal</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {goals.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setGoal(item.id)}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      goal === item.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                    }`}
                  >
                    <div className="font-medium text-foreground">{item.label}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Use AIson to plan and produce content around this outcome.
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Brand profile</Label>
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="font-medium text-foreground">{companyName || "Brand profile not completed yet"}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {brandSourceUrl || "Add your website and brand details in Settings → Brand to strengthen campaign context."}
                  </p>
                  <Button variant="link" className="px-0 mt-2 h-auto" onClick={() => navigate("/account")}>
                    Open Brand settings
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tone of voice</Label>
                <div className="flex gap-2 flex-wrap">
                  {tones.map((item) => (
                    <Button
                      key={item}
                      type="button"
                      variant={tone === item ? "default" : "outline"}
                      onClick={() => setTone(item)}
                    >
                      {item}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setCurrentStep(2)} disabled={!canProceedStep1}>
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>
        )}

        {currentStep === 2 && (
          <Card className="p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Channels and cadence</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Pick the channels AIson should plan for and set a realistic weekly rhythm.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Channels</Label>
              <div className="flex gap-2 flex-wrap">
                {availableChannels.map((channel) => (
                  <Button
                    key={channel}
                    type="button"
                    variant={channels.includes(channel) ? "default" : "outline"}
                    onClick={() => toggleChannel(channel)}
                    className="capitalize"
                  >
                    {channel}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="duration">Duration in days</Label>
                <Input
                  id="duration"
                  type="number"
                  min={7}
                  max={180}
                  value={durationDays}
                  onChange={(e) => setDurationDays(Number(e.target.value) || 30)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cadence">Posts per week</Label>
                <Input
                  id="cadence"
                  type="number"
                  min={1}
                  max={14}
                  value={cadence}
                  onChange={(e) => setCadence(Number(e.target.value) || 4)}
                />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <p className="font-medium text-foreground">Why this step matters</p>
              <p className="text-sm text-muted-foreground mt-1">
                AIson can only produce useful plans when the campaign scope is clear. This replaces the old early summary and keeps the review until the very end.
              </p>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setCurrentStep(1)}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button onClick={() => setCurrentStep(3)} disabled={!canProceedStep2}>
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>
        )}

        {currentStep === 3 && (
          <Card className="p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Final review</h2>
              <p className="text-sm text-muted-foreground mt-1">
                This is the only summary step, placed after all settings are complete.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border p-4">
                <p className="text-sm text-muted-foreground">Campaign name</p>
                <p className="font-medium text-foreground mt-1">{campaignName}</p>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-sm text-muted-foreground">Goal</p>
                <p className="font-medium text-foreground mt-1">{goals.find((item) => item.id === goal)?.label}</p>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-sm text-muted-foreground">Tone</p>
                <p className="font-medium text-foreground mt-1">{tone}</p>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-sm text-muted-foreground">Cadence</p>
                <p className="font-medium text-foreground mt-1">{cadence} posts/week for {durationDays} days</p>
              </div>
            </div>

            <div className="rounded-xl border border-border p-4">
              <p className="text-sm text-muted-foreground">Channels</p>
              <div className="flex gap-2 flex-wrap mt-2">
                {channels.map((channel) => (
                  <Badge key={channel} variant="secondary" className="capitalize">
                    {channel}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Brand profile reuse</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    AIson will use your saved brand settings as the source of truth for this campaign, instead of asking for the same brand link again in the flow.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setCurrentStep(2)}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button onClick={handleCreateCampaign} disabled={isCreating}>
                {isCreating ? "Creating..." : "Create Campaign"}
                {!isCreating && <ArrowRight className="w-4 h-4 ml-2" />}
              </Button>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
