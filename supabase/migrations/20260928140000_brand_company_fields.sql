-- Company details are now per-brand: each brand carries its own location & website.
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS website text;
