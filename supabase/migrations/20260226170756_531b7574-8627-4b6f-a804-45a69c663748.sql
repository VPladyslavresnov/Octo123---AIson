
-- Create brand_profiles table
CREATE TABLE public.brand_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source_url TEXT NOT NULL,
  brand_name TEXT,
  tagline TEXT,
  brand_description TEXT,
  tone_of_voice TEXT,
  key_messages TEXT[] DEFAULT '{}',
  primary_colors TEXT[] DEFAULT '{}',
  secondary_colors TEXT[] DEFAULT '{}',
  font_style TEXT,
  visual_style TEXT,
  content_themes TEXT[] DEFAULT '{}',
  posting_style TEXT,
  cta_patterns TEXT[] DEFAULT '{}',
  hashtags TEXT[] DEFAULT '{}',
  emoji_usage BOOLEAN DEFAULT false,
  content_examples TEXT[] DEFAULT '{}',
  target_audience_signals TEXT,
  industry TEXT,
  location TEXT,
  competitors_mentioned TEXT[] DEFAULT '{}',
  social_data JSONB DEFAULT '{}'::jsonb,
  screenshot_url TEXT,
  scraped_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add RLS
ALTER TABLE public.brand_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own brand profiles"
  ON public.brand_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own brand profiles"
  ON public.brand_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own brand profiles"
  ON public.brand_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own brand profiles"
  ON public.brand_profiles FOR DELETE
  USING (auth.uid() = user_id);

-- Add brand_intelligence column to campaigns
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS brand_intelligence JSONB DEFAULT '{}'::jsonb;

-- Add updated_at trigger to brand_profiles
CREATE TRIGGER update_brand_profiles_updated_at
  BEFORE UPDATE ON public.brand_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
