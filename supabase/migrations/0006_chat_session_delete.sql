-- 0006_chat_session_delete.sql — Clients may delete their own conversations
-- with Nick (owner request, 2026-09-03).
--
-- Only the member who started the session (user_id = auth.uid()) may delete
-- it; a co-member of the same business cannot. chat_messages and
-- chat_citations reference the session ON DELETE CASCADE, and referential
-- actions bypass row security, so the whole thread goes with it. The firm
-- keeps no path to conversations (0002); ai_usage_daily aggregates survive.
create policy "sessions_owner_delete" on public.chat_sessions
  for delete using (public.is_entity_member(business_entity_id) and user_id = auth.uid());
