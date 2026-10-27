CREATE TABLE public.strategy_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text,
  requested_content_type text NOT NULL DEFAULT 'text',
  source_prompt text NOT NULL,
  resolved_competitors text[] DEFAULT ARRAY[]::text[],
  client_accounts jsonb DEFAULT '[]'::jsonb,
  competitor_accounts jsonb DEFAULT '[]'::jsonb,
  research_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  optimized_prompt text NOT NULL,
  prompt_score integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.strategy_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own strategy reports"
  ON public.strategy_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own strategy reports"
  ON public.strategy_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own strategy reports"
  ON public.strategy_reports FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own strategy reports"
  ON public.strategy_reports FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_strategy_reports_updated_at
  BEFORE UPDATE ON public.strategy_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
