-- Security Fix: Remove INSERT and UPDATE policies from user_balance table
-- Users should only be able to READ their balance, not modify it directly

-- Drop the dangerous INSERT and UPDATE policies
DROP POLICY IF EXISTS "Users can insert their own balance" ON public.user_balance;
DROP POLICY IF EXISTS "Users can update their own balance" ON public.user_balance;

-- The SELECT policy remains: "Users can view their own balance"
-- This allows users to see their balance but not manipulate it

-- Add database constraints for input validation on company_details
ALTER TABLE public.company_details 
  ADD CONSTRAINT company_name_length CHECK (company_name IS NULL OR length(company_name) <= 200);

ALTER TABLE public.company_details 
  ADD CONSTRAINT website_length CHECK (website IS NULL OR length(website) <= 500);

ALTER TABLE public.company_details 
  ADD CONSTRAINT target_audience_length CHECK (target_audience IS NULL OR length(target_audience) <= 1000);

ALTER TABLE public.company_details 
  ADD CONSTRAINT business_type_length CHECK (business_type IS NULL OR length(business_type) <= 200);

ALTER TABLE public.company_details 
  ADD CONSTRAINT location_length CHECK (location IS NULL OR length(location) <= 200);

-- Add constraints for profiles table
ALTER TABLE public.profiles 
  ADD CONSTRAINT full_name_length CHECK (full_name IS NULL OR length(full_name) <= 200);

-- Add constraints for api_keys table
ALTER TABLE public.api_keys 
  ADD CONSTRAINT service_name_length CHECK (length(service_name) <= 100);

ALTER TABLE public.api_keys 
  ADD CONSTRAINT api_key_length CHECK (length(api_key) <= 500);