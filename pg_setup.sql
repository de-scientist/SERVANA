DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'servana') THEN
    CREATE ROLE servana WITH LOGIN PASSWORD 'servana' CREATEDB;
  END IF;
END
$$;
CREATE DATABASE servana_test OWNER servana;