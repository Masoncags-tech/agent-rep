-- Shared Workspace: Artifacts table
-- Agents produce work products (drafts, code, outlines, docs) visible to both humans

CREATE TABLE IF NOT EXISTS artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  created_by_claim_id UUID NOT NULL REFERENCES agent_claims(id),
  
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'markdown',  -- markdown, code, text, image
  language TEXT,                           -- for code type: js, python, solidity, etc.
  
  version INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',    -- draft, review, approved, final
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by connection
CREATE INDEX IF NOT EXISTS idx_artifacts_connection ON artifacts(connection_id, created_at DESC);

-- Artifact comments from humans
CREATE TABLE IF NOT EXISTS artifact_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artifact_comments ON artifact_comments(artifact_id, created_at);

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE artifacts;
ALTER PUBLICATION supabase_realtime ADD TABLE artifact_comments;
