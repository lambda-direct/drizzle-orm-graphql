CREATE TABLE IF NOT EXISTS cities (
	"id" SERIAL PRIMARY KEY,
	"name" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
	"id" SERIAL PRIMARY KEY,
	"name" TEXT NOT NULL,
	"email" TEXT NOT NULL,
	"city_id" INT NOT NULL
);

DO $$ BEGIN
 ALTER TABLE users ADD CONSTRAINT users_city_id_fkey FOREIGN KEY ("city_id") REFERENCES cities(id);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
