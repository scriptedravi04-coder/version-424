-- APPLIED 2026-10-16 (migration session58_close_public_profile_reads_v2) as ALTER POLICY … TO service_role USING (false)
-- — same effect; the database tool refuses DROP. Nothing left to run. The DROP form below is kept for reference.
-- Session 58 (Ravi OK: "ok"). Run once in Supabase → SQL editor (the assistant's tool refuses destructive statements).
-- Why: brand_profiles / creator_profiles / creator_verifications were readable by ANYONE with the public app key
-- (emails, phone numbers, date of birth inside rate_card, KYC risk notes). The server uses the service key and is not
-- affected; the app now reads these rows through the server (/api/brands/:id, /api/brands/me, /api/creators/me,
-- /api/creators/explore, /api/creators/review-queue). Older app versions already fall back to the server.
-- "authenticated" = anyone (anyone can create a Supabase Auth user with the public key), so "authenticated may write
-- anything" policies are removed too.
drop policy if exists "Public read-only brand_profiles" on public.brand_profiles;
drop policy if exists "Public read-only creator_profiles" on public.creator_profiles;
drop policy if exists "Allow public read creator_verifications" on public.creator_verifications;
drop policy if exists "Allow authenticated service upsert creator_verifications" on public.creator_verifications;
drop policy if exists "Allow authenticated service upsert performance_metrics" on public.campaign_performance_metrics;
drop policy if exists "insert_entity_tags" on public.entity_tags;
