-- The app (Library, GeneratedContent, agent-chat save_creative) stores
-- content_type values 'text' and 'video' in addition to the original enum,
-- so drop the restrictive CHECK constraint.
ALTER TABLE public.creatives DROP CONSTRAINT IF EXISTS creatives_content_type_check;
