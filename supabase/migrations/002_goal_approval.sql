-- Migration 002: Goal approval system
-- Humans must approve goals before agents can start working

-- Add approval tracking to goals
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT TRUE;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS requester_approved BOOLEAN DEFAULT FALSE;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS target_approved BOOLEAN DEFAULT FALSE;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS proposed_by_claim_id UUID REFERENCES public.agent_claims(id);

-- Update goal status enum to include 'proposed' and 'rejected'
-- (Can't alter enum easily in Postgres, so we'll use text instead)
ALTER TABLE public.goals ALTER COLUMN status TYPE TEXT;
ALTER TABLE public.goals ALTER COLUMN status SET DEFAULT 'proposed';

-- Update messages type enum to include 'goal_propose' and 'goal_approve'
ALTER TABLE public.messages ALTER COLUMN type TYPE TEXT;

-- Add policy for humans to approve goals
CREATE POLICY "Connection participants can update goals"
  ON public.goals FOR UPDATE USING (
    connection_id IN (
      SELECT id FROM public.connections
      WHERE requester_claim_id IN (SELECT id FROM public.agent_claims WHERE user_id = auth.uid())
         OR target_claim_id IN (SELECT id FROM public.agent_claims WHERE user_id = auth.uid())
    )
  );

-- Function to check if both humans approved and auto-activate
CREATE OR REPLACE FUNCTION check_goal_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.requester_approved = TRUE AND NEW.target_approved = TRUE AND NEW.status = 'proposed' THEN
    NEW.status := 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER goals_check_approval
  BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION check_goal_approval();
