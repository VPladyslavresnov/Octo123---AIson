import { supabase } from "@/integrations/supabase/client";

export interface StrategyResult {
  score: number | null;
  optimizedPrompt: string;
  optimizedSystemContext: string;
  resolvedCompetitors: Array<{ name: string; reason: string; account_url?: string }>;
  report?: {
    executive_summary?: string;
    competitor_analysis?: {
      landscape_summary?: string;
      patterns_to_emulate?: string[];
      gaps_to_exploit?: string[];
    };
    strategy?: {
      recommended_angle?: string;
      recommended_hooks?: string[];
      recommended_ctas?: string[];
    };
  };
}

export interface StrategyProgressItem {
  id: string;
  label: string;
  detail: string;
  state: "pending" | "running" | "done" | "error";
}

const BASE_STEPS: StrategyProgressItem[] = [
  {
    id: "context",
    label: "Collecting client context",
    detail: "Loading brand profile, campaign brief, and account context.",
    state: "pending",
  },
  {
    id: "competitors",
    label: "Resolving competitors",
    detail: "Checking direct competitors first, then expanding with LLM discovery if needed.",
    state: "pending",
  },
  {
    id: "accounts",
    label: "Parsing accounts",
    detail: "Researching client and competitor Meta, Instagram, and LinkedIn sources.",
    state: "pending",
  },
  {
    id: "report",
    label: "Building strategic report",
    detail: "Synthesizing positioning, competitor patterns, brand tone, and creative direction.",
    state: "pending",
  },
  {
    id: "prompt",
    label: "Optimizing generation prompt",
    detail: "Scoring the prompt and revising it toward a high-satisfaction result.",
    state: "pending",
  },
];

function cloneSteps() {
  return BASE_STEPS.map((step) => ({ ...step }));
}

function updateStep(
  steps: StrategyProgressItem[],
  index: number,
  state: StrategyProgressItem["state"],
  detail?: string,
) {
  return steps.map((step, stepIndex) =>
    stepIndex === index
      ? {
          ...step,
          state,
          detail: detail || step.detail,
        }
      : step,
  );
}

export async function runStrategyPreparation(params: {
  sourcePrompt: string;
  requestedContentType: string;
  requestedGoal?: string;
  preferredModel?: string;
  competitorInputs?: string[];
  onProgress?: (steps: StrategyProgressItem[]) => void;
}): Promise<StrategyResult> {
  let steps = cloneSteps();
  params.onProgress?.(steps);

  let currentStep = 0;
  steps = updateStep(steps, currentStep, "running");
  params.onProgress?.(steps);

  const progressTimer = window.setInterval(() => {
    if (currentStep < steps.length - 1) {
      steps = updateStep(steps, currentStep, "done");
      currentStep += 1;
      steps = updateStep(steps, currentStep, "running");
      params.onProgress?.(steps);
    }
  }, 1400);

  try {
    const { data, error } = await supabase.functions.invoke("generate-strategy-prompt", {
      body: {
        sourcePrompt: params.sourcePrompt,
        requestedContentType: params.requestedContentType,
        requestedGoal: params.requestedGoal || params.sourcePrompt,
        preferredModel: params.preferredModel,
        competitorInputs: params.competitorInputs || [],
      },
    });

    if (error) throw error;

    window.clearInterval(progressTimer);
    steps = steps.map((step) => ({ ...step, state: "done" as const }));
    params.onProgress?.(steps);

    return data as StrategyResult;
  } catch (error) {
    window.clearInterval(progressTimer);
    steps = updateStep(steps, currentStep, "error", "Strategy preparation failed. Falling back where possible.");
    params.onProgress?.(steps);
    throw error;
  }
}
