-- Update RLS policy to allow users to update their own creatives (including saved field)
DROP POLICY IF EXISTS "Users can create their own creatives" ON public.creatives;
DROP POLICY IF EXISTS "Users can view their own creatives" ON public.creatives;
DROP POLICY IF EXISTS "Users can delete their own creatives" ON public.creatives;

-- Recreate policies with update support
CREATE POLICY "Users can create their own creatives"
ON public.creatives
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own creatives"
ON public.creatives
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own creatives"
ON public.creatives
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own creatives"
ON public.creatives
FOR DELETE
USING (auth.uid() = user_id);