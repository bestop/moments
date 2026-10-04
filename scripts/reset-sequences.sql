-- Reset all serial sequences to MAX(id)+1 after importing legacy rows with
-- explicit ids (e.g. a D1/Turso SQLite dump replay). Otherwise new inserts
-- would collide on primary keys.
--
-- Usage: psql "$DATABASE_URL" -f scripts/reset-sequences.sql

DO $$
DECLARE
  t text;
  maxid bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'User', 'Memo', 'Comment', 'Config',
    'Notification', 'SystemConfig', 'PushSubscription'
  ]
  LOOP
    EXECUTE format('SELECT COALESCE(MAX(id), 0) FROM %I', t) INTO maxid;
    PERFORM setval(pg_get_serial_sequence('"' || t || '"', 'id'), maxid + 1, false);
    RAISE NOTICE '% -> next id %', t, maxid + 1;
  END LOOP;
END $$;
