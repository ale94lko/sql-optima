-- Intentional anti-patterns for static schema analysis.
-- Engine: postgres or mysql (node-sql-parser)

-- Missing PRIMARY KEY
CREATE TABLE products (
  name VARCHAR(100) NOT NULL,
  price DECIMAL(10, 2)
);

-- PRIMARY KEY present, but FOREIGN KEY without a supporting index
CREATE TABLE order_items (
  id INT PRIMARY KEY,
  order_id INT NOT NULL,
  quantity INT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
