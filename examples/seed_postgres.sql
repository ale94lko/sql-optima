-- Seed data for dynamic EXPLAIN demos against PostgreSQL.
-- Apply before analyzing examples/mixed_postgres.sql or examples/bad_queries.sql.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INT,
  amount DECIMAL(10, 2)
);

INSERT INTO users (email)
SELECT 'user_' || generate_series(1, 100) || '@example.com';

INSERT INTO orders (user_id, amount)
SELECT (random() * 99 + 1)::int, random() * 100
FROM generate_series(1, 500);
