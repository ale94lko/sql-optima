-- Intentional anti-patterns for static query analysis.
-- Assumes tables `users` and `orders` already exist when used for dynamic EXPLAIN.

-- Wildcard projection
SELECT * FROM orders WHERE user_id = 5;

-- Leading-wildcard LIKE (cannot use a normal B-tree index efficiently)
SELECT id, email FROM users WHERE email LIKE '%example.com';
