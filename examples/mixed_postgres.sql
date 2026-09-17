-- Mixed Postgres sample for sql-optima demos.
-- Static analysis runs on every statement below.
-- Dynamic EXPLAIN uses the last SELECT/WITH and requires live tables
-- (see examples/seed_postgres.sql or the CI "Prepare database schema" step).

CREATE TABLE products (
  name VARCHAR(100) NOT NULL,
  price DECIMAL(10, 2)
);

CREATE TABLE order_items (
  id INT PRIMARY KEY,
  order_id INT NOT NULL,
  quantity INT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

SELECT * FROM orders WHERE user_id = 5;

SELECT id, email FROM users WHERE email LIKE '%example.com';
