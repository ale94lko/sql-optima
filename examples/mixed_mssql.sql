-- Mixed SQL Server demo: schema + SELECT for static + SHOWPLAN analysis
CREATE TABLE users (
  id INT NOT NULL PRIMARY KEY,
  email VARCHAR(255) NOT NULL
);

CREATE TABLE orders (
  id INT NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

INSERT INTO users (id, email) VALUES (1, 'demo@example.com');
INSERT INTO orders (id, user_id, amount) VALUES (1, 1, 42.50);

SELECT * FROM orders WHERE user_id = 1 AND amount > 10;
