-- Seed tables for SQL Server SHOWPLAN demos
IF OBJECT_ID('dbo.orders', 'U') IS NOT NULL DROP TABLE dbo.orders;
IF OBJECT_ID('dbo.users', 'U') IS NOT NULL DROP TABLE dbo.users;

CREATE TABLE users (
  id INT NOT NULL PRIMARY KEY,
  email VARCHAR(255) NOT NULL
);

CREATE TABLE orders (
  id INT NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL
);

INSERT INTO users (id, email) VALUES (1, 'demo@example.com');
INSERT INTO orders (id, user_id, amount) VALUES (1, 1, 42.50);
