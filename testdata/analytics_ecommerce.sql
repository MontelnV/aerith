-- Test analytics database #1: e-commerce / marketplace
-- SQLite-compatible DDL + sample data

PRAGMA foreign_keys = ON;

CREATE TABLE dim_category (
  category_id   INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  parent_id     INTEGER REFERENCES dim_category(category_id)
);

CREATE TABLE dim_product (
  product_id    INTEGER PRIMARY KEY,
  sku           TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  brand         TEXT,
  category_id   INTEGER NOT NULL REFERENCES dim_category(category_id),
  cost_price    REAL NOT NULL,
  list_price    REAL NOT NULL
);

CREATE TABLE dim_customer (
  customer_id   INTEGER PRIMARY KEY,
  email         TEXT NOT NULL,
  city          TEXT,
  segment       TEXT NOT NULL CHECK (segment IN ('new', 'regular', 'vip'))
);

CREATE TABLE fact_order (
  order_id      INTEGER PRIMARY KEY,
  customer_id   INTEGER NOT NULL REFERENCES dim_customer(customer_id),
  order_date    TEXT NOT NULL,
  channel       TEXT NOT NULL CHECK (channel IN ('web', 'app', 'marketplace')),
  status        TEXT NOT NULL CHECK (status IN ('paid', 'shipped', 'returned', 'cancelled'))
);

CREATE TABLE fact_order_line (
  line_id       INTEGER PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES fact_order(order_id),
  product_id    INTEGER NOT NULL REFERENCES dim_product(product_id),
  qty           INTEGER NOT NULL CHECK (qty > 0),
  unit_price    REAL NOT NULL,
  discount_pct  REAL NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100)
);

-- Categories
INSERT INTO dim_category (category_id, name, parent_id) VALUES
  (1, 'Apparel', NULL),
  (2, 'Footwear', NULL),
  (3, 'T-shirts', 1),
  (4, 'Jackets', 1),
  (5, 'Sneakers', 2);

-- Products
INSERT INTO dim_product (product_id, sku, name, brand, category_id, cost_price, list_price) VALUES
  (101, 'TS-BLK-M', 'Basic black tee M', 'UrbanLine', 3, 450, 1290),
  (102, 'TS-WHT-L', 'Basic white tee L', 'UrbanLine', 3, 450, 1290),
  (103, 'JK-GRN-42', 'Green windbreaker 42', 'NorthPeak', 4, 3200, 8990),
  (104, 'SN-RUN-40', 'Running sneakers 40', 'Stride', 5, 2100, 5490),
  (105, 'SN-WLK-39', 'City sneakers 39', 'Stride', 5, 1800, 4790);

-- Customers
INSERT INTO dim_customer (customer_id, email, city, segment) VALUES
  (1, 'anna@example.com', 'New York', 'vip'),
  (2, 'boris@example.com', 'Chicago', 'regular'),
  (3, 'chloe@example.com', 'Austin', 'new'),
  (4, 'dmitry@example.com', 'Seattle', 'regular'),
  (5, 'elena@example.com', 'New York', 'vip');

-- Orders
INSERT INTO fact_order (order_id, customer_id, order_date, channel, status) VALUES
  (10001, 1, '2025-03-01', 'app', 'shipped'),
  (10002, 2, '2025-03-02', 'web', 'paid'),
  (10003, 3, '2025-03-03', 'web', 'shipped'),
  (10004, 4, '2025-03-05', 'marketplace', 'returned'),
  (10005, 1, '2025-03-10', 'app', 'paid'),
  (10006, 5, '2025-03-12', 'web', 'shipped'),
  (10007, 2, '2025-03-15', 'app', 'cancelled');

-- Order lines
INSERT INTO fact_order_line (line_id, order_id, product_id, qty, unit_price, discount_pct) VALUES
  (1, 10001, 101, 2, 1290, 10),
  (2, 10001, 104, 1, 5490, 0),
  (3, 10002, 103, 1, 8990, 15),
  (4, 10003, 102, 1, 1290, 0),
  (5, 10003, 105, 1, 4790, 5),
  (6, 10004, 104, 1, 5490, 0),
  (7, 10005, 101, 3, 1290, 20),
  (8, 10006, 103, 1, 8990, 0),
  (9, 10006, 105, 2, 4790, 10),
  (10, 10007, 102, 1, 1290, 0);
