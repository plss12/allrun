-- A phone sends its designs with an upsert (ADR 019), and the Data API's upsert writes every column
-- it sends, the design's id too, on a row that already exists: without this, sending a design
-- again was refused. Row level security still keeps each user to their own rows.
grant update (id) on table public.user_designs to authenticated;
