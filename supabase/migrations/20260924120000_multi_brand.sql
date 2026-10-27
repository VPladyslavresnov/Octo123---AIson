-- Multi-brand per account.
-- brand_profiles already allows multiple rows per user (keyed by user_id + source_url
-- in the brand-intelligence function). This adds the "active brand" pointer and a
-- flag for manually-created brands.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_brand_id uuid REFERENCES public.brand_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.brand_profiles
  ADD COLUMN IF NOT EXISTS is_manual boolean DEFAULT false;
