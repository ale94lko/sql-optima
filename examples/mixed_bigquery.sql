-- BigQuery-oriented sample for static-only dialect linting
CREATE TABLE dataset.products (
  name STRING
);

SELECT * FROM dataset.users WHERE email LIKE '%example.com';
