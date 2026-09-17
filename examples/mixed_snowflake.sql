-- Snowflake-oriented sample for static-only dialect linting
CREATE TABLE products (
  name VARCHAR
);

SELECT * FROM users WHERE email LIKE '%example.com';
