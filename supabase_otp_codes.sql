-- Run this once in your Supabase project's SQL editor.
-- Backs email-change and password-reset OTP codes with Supabase instead of
-- an in-memory Map, so codes survive across serverless function instances.

create table if not exists otp_codes (
  key text primary key,          -- email address, or "pwd:<customer_id>" for password resets
  code text not null,
  email text,                    -- only used for password-reset OTPs
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Optional: automatically clean up expired codes.
-- You can run this periodically (e.g. via a Supabase cron job / edge function),
-- or just leave it — expired rows are already rejected by the app's expiry check.
-- delete from otp_codes where expires_at < now();
