-- Mixed SQLite sample for sql-optima demos.
-- The sqlite engine applies CREATE/INSERT from this script into an in-memory DB
-- before running EXPLAIN QUERY PLAN on the last SELECT.

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  amount REAL
);

INSERT INTO users (id, email) VALUES (1, 'admin@example.com');
INSERT INTO users (id, email) VALUES (2, 'user@example.com');
INSERT INTO orders (id, user_id, amount) VALUES (1, 1, 10.5);
INSERT INTO orders (id, user_id, amount) VALUES (2, 2, 20.0);

CREATE TABLE products (
  name TEXT NOT NULL,
  price REAL
);

SELECT * FROM orders WHERE user_id = 1;
