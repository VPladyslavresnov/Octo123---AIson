-- Campaign management tables
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  brand_source_url text,
  brand_style jsonb DEFAULT '{}'::jsonb, -- stores parsed brand colors, typography, tone, etc.
  objective text CHECK (objective IN ('awareness', 'engagement', 'traffic', 'leads', 'sales')),
  channels text[] DEFAULT ARRAY[]::text[],
  duration_days integer DEFAULT 30,
  content_mix jsonb DEFAULT '{"image": 40, "short_video": 30, "carousel": 20, "story": 10}'::jsonb,
  posting_cadence_per_week integer DEFAULT 5,
  key_offers_or_topics text[],
  tone text,
  status text DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Generated creatives (images/videos + captions)
CREATE TABLE public.creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image', 'short_video', 'carousel', 'story')),
  visual_url text, -- generated image/video URL
  caption text,
  alt_text text,
  hashtags text[],
  generation_metadata jsonb DEFAULT '{}'::jsonb, -- what trends/preferences influenced this
  created_at timestamptz DEFAULT now()
);

-- User feedback on creatives (swipe/heart)
CREATE TABLE public.creative_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id uuid REFERENCES public.creatives(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  feedback_type text NOT NULL CHECK (feedback_type IN ('like', 'dislike', 'love')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(creative_id, user_id)
);

-- Learned preferences from feedback
CREATE TABLE public.preference_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  visual_preferences jsonb DEFAULT '{}'::jsonb, -- colors, styles, formats preferred
  copy_preferences jsonb DEFAULT '{}'::jsonb, -- tone, hooks, CTAs preferred
  format_preferences jsonb DEFAULT '{}'::jsonb, -- image vs video vs carousel
  updated_at timestamptz DEFAULT now()
);

-- Social media connections
CREATE TABLE public.social_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform IN ('instagram', 'facebook', 'linkedin', 'tiktok', 'pinterest', 'youtube', 'twitter')),
  account_name text,
  access_token_encrypted text, -- store encrypted tokens
  auto_publish boolean DEFAULT false,
  default_schedule jsonb DEFAULT '{}'::jsonb, -- preferred posting times per platform
  connected_at timestamptz DEFAULT now(),
  UNIQUE(user_id, platform)
);

-- Scheduled posts
CREATE TABLE public.scheduled_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id uuid REFERENCES public.creatives(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  platforms text[] NOT NULL,
  scheduled_time timestamptz NOT NULL,
  status text DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'published', 'failed', 'cancelled')),
  published_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Real analytics from published posts
CREATE TABLE public.post_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_post_id uuid REFERENCES public.scheduled_posts(id) ON DELETE CASCADE,
  platform text NOT NULL,
  reach integer DEFAULT 0,
  impressions integer DEFAULT 0,
  likes integer DEFAULT 0,
  comments integer DEFAULT 0,
  shares integer DEFAULT 0,
  clicks integer DEFAULT 0,
  video_views integer DEFAULT 0,
  engagement_rate numeric(5,2),
  fetched_at timestamptz DEFAULT now(),
  UNIQUE(scheduled_post_id, platform)
);

-- Trend profiles per campaign
CREATE TABLE public.trend_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  location text,
  business_type text,
  target_audience text,
  top_themes text[],
  top_visual_styles text[],
  top_hooks_ctas text[],
  hashtag_suggestions text[],
  recommended_posting_windows jsonb DEFAULT '{}'::jsonb,
  evidence text, -- brief explanation of how trends were inferred
  created_at timestamptz DEFAULT now()
);

-- Add brand_source_url and business details to company_details
ALTER TABLE public.company_details 
ADD COLUMN IF NOT EXISTS brand_source_url text,
ADD COLUMN IF NOT EXISTS business_type text,
ADD COLUMN IF NOT EXISTS location text;

-- Enable RLS on all new tables
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preference_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trend_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for campaigns
CREATE POLICY "Users can view their own campaigns"
  ON public.campaigns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own campaigns"
  ON public.campaigns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own campaigns"
  ON public.campaigns FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own campaigns"
  ON public.campaigns FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for creatives
CREATE POLICY "Users can view their own creatives"
  ON public.creatives FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own creatives"
  ON public.creatives FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own creatives"
  ON public.creatives FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for creative_feedback
CREATE POLICY "Users can view their own feedback"
  ON public.creative_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own feedback"
  ON public.creative_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own feedback"
  ON public.creative_feedback FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own feedback"
  ON public.creative_feedback FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for preference_weights
CREATE POLICY "Users can view their own preferences"
  ON public.preference_weights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
  ON public.preference_weights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
  ON public.preference_weights FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for social_connections
CREATE POLICY "Users can view their own social connections"
  ON public.social_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own social connections"
  ON public.social_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own social connections"
  ON public.social_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own social connections"
  ON public.social_connections FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for scheduled_posts
CREATE POLICY "Users can view their own scheduled posts"
  ON public.scheduled_posts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own scheduled posts"
  ON public.scheduled_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scheduled posts"
  ON public.scheduled_posts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own scheduled posts"
  ON public.scheduled_posts FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for post_analytics
CREATE POLICY "Users can view analytics for their posts"
  ON public.post_analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.scheduled_posts 
      WHERE scheduled_posts.id = post_analytics.scheduled_post_id 
      AND scheduled_posts.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert analytics"
  ON public.post_analytics FOR INSERT
  WITH CHECK (true);

-- RLS Policies for trend_profiles
CREATE POLICY "Users can view trend profiles for their campaigns"
  ON public.trend_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns 
      WHERE campaigns.id = trend_profiles.campaign_id 
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "System can create trend profiles"
  ON public.trend_profiles FOR INSERT
  WITH CHECK (true);

-- Triggers for updated_at
CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_preference_weights_updated_at
  BEFORE UPDATE ON public.preference_weights
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();