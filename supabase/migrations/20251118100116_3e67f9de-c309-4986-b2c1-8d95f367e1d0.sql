-- Add saved field to creatives table
ALTER TABLE public.creatives 
ADD COLUMN saved BOOLEAN DEFAULT false;