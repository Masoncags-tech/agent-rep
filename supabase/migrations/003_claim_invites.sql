-- Add invite token columns to agent_claims
ALTER TABLE public.agent_claims
  ADD COLUMN IF NOT EXISTS invite_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS invite_created_at TIMESTAMPTZ;

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_agent_claims_invite ON public.agent_claims(invite_token_hash) WHERE invite_token_hash IS NOT NULL;
