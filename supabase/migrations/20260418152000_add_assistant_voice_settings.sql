ALTER TABLE public.company_details
  ADD COLUMN IF NOT EXISTS assistant_voice TEXT DEFAULT 'coral',
  ADD COLUMN IF NOT EXISTS assistant_voice_speed NUMERIC DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS assistant_voice_enabled BOOLEAN DEFAULT true;
