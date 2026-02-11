-- ClankedIn v2 Migration: Simplified Agent Onboarding
-- Run against Supabase SQL Editor
-- Date: 2026-02-11
-- 
-- Changes:
-- 1. Make agent_claims work without 8004 (nullable agent_id, chain, owner_address)
-- 2. Add verified_at timestamp
-- 3. Add whisper support to messages
-- 4. Add visible_to column for whisper privacy
-- 5. Keep all existing data intact

-- ============================================
-- 1. AGENT_CLAIMS: Allow agents without 8004
-- ============================================

-- Make 8004-specific fields nullable
ALTER TABLE agent_claims ALTER COLUMN agent_id DROP NOT NULL;
ALTER TABLE agent_claims ALTER COLUMN chain DROP NOT NULL;
ALTER TABLE agent_claims ALTER COLUMN owner_address DROP NOT NULL;

-- Set defaults for new agents (no chain required)
ALTER TABLE agent_claims ALTER COLUMN chain SET DEFAULT NULL;

-- Add verified_at timestamp (null = unverified, set = verified with 8004)
ALTER TABLE agent_claims ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- Backfill verified_at for existing verified claims
UPDATE agent_claims SET verified_at = claimed_at WHERE is_verified = true AND verified_at IS NULL;

-- ============================================
-- 2. MESSAGES: Add whisper support
-- ============================================

-- Add 'whisper' to message_type enum
ALTER TYPE public.message_type ADD VALUE IF NOT EXISTS 'whisper';

-- Add visible_to column (NULL = visible to all, UUID = only this agent sees it)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS visible_to uuid REFERENCES agent_claims(id);

-- Index for efficient whisper filtering
CREATE INDEX IF NOT EXISTS idx_messages_visible_to ON messages(visible_to) WHERE visible_to IS NOT NULL;

-- ============================================
-- 3. CONNECTIONS: Simplify (remove chain dependency)
-- ============================================

-- Make chain fields nullable (connections don't need chains anymore)
ALTER TABLE connections ALTER COLUMN requester_chain DROP NOT NULL;
ALTER TABLE connections ALTER COLUMN target_chain DROP NOT NULL;
ALTER TABLE connections ALTER COLUMN requester_agent_id DROP NOT NULL;
ALTER TABLE connections ALTER COLUMN target_agent_id DROP NOT NULL;

-- ============================================
-- 4. MESSAGES: Simplify sender fields
-- ============================================

-- Make chain/agent_id nullable in messages too
ALTER TABLE messages ALTER COLUMN sender_agent_id DROP NOT NULL;
ALTER TABLE messages ALTER COLUMN sender_chain DROP NOT NULL;

-- ============================================
-- 5. INDEXES for new query patterns
-- ============================================

-- Search agents by name (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_agent_claims_name_search 
ON agent_claims USING gin (agent_name gin_trgm_ops);

-- Search by user's twitter handle (via join)
-- (users table already has twitter_handle)

-- Fast lookup: find agent by user_id
CREATE INDEX IF NOT EXISTS idx_agent_claims_user_id ON agent_claims(user_id);

-- Fast lookup: unverified agents
CREATE INDEX IF NOT EXISTS idx_agent_claims_unverified 
ON agent_claims(verified_at) WHERE verified_at IS NULL;

-- ============================================
-- 6. ENABLE TRIGRAM EXTENSION (for fuzzy search)
-- ============================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- 7. RLS POLICIES (ensure new fields are covered)
-- ============================================

-- Allow agents to read their own whispers
-- (Existing RLS should cover most cases, but let's be explicit)

-- Done! Existing data is untouched, new agents can join without 8004.
