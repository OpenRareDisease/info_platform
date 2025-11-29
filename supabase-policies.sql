-- Enable insert for authenticated and anonymous users
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- Option 1: Allow all inserts (simplest for development)
CREATE POLICY "Enable insert for all users" ON "public"."notes"
FOR INSERT
TO public
WITH CHECK (true);

-- Option 2: Allow all reads (so you can see the notes)
CREATE POLICY "Enable read for all users" ON "public"."notes"
FOR SELECT
TO public
USING (true);

-- If you want to allow updates and deletes too:
CREATE POLICY "Enable update for all users" ON "public"."notes"
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

CREATE POLICY "Enable delete for all users" ON "public"."notes"
FOR DELETE
TO public
USING (true);

-- Alternative: If you want to disable RLS entirely (NOT recommended for production)
-- ALTER TABLE "public"."notes" DISABLE ROW LEVEL SECURITY;
