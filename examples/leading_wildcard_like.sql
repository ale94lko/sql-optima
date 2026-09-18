-- Intentional static anti-pattern: leading-wildcard LIKE.
-- Isolates LEADING_WILDCARD_LIKE for quick smoke checks without SELECT *.
-- Assumes table `users` exists when used for dynamic EXPLAIN.

SELECT id, email FROM users WHERE email LIKE '%example.com';
SELECT id, name FROM users WHERE name LIKE '%son';
