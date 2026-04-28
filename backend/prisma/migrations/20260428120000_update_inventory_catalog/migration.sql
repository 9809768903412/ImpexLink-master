UPDATE users
SET full_name = 'Manny Dela Cruz'
WHERE email = 'carlos.martinez@impex.com'
  OR full_name = 'Carlos Martinez';

WITH catalog(item_name, unit, unit_price, aliases) AS (
  VALUES
    ('Welding machine', 'unit', 65000.00::numeric, ARRAY['welding machine']),
    ('Steel brush', 'pcs', 50.00::numeric, ARRAY['steel brush']),
    ('Spatula 6"', 'pcs', 45.00::numeric, ARRAY['spatula 6"']),
    ('Spatula 4"', 'pcs', 35.00::numeric, ARRAY['spatula 4"']),
    ('Spatula 2"', 'pcs', 25.00::numeric, ARRAY['spatula 2"']),
    ('Seal Tech AW 5 ltrs', 'pail', 13550.00::numeric, ARRAY['seal tech aw 5 ltrs']),
    ('Seal Tech AW 20 ltrs', 'pail', 48500.00::numeric, ARRAY['seal tech aw 20 ltrs']),
    ('Sand paper #180', 'sheet', 20.00::numeric, ARRAY['sand paper #180']),
    ('Sand paper #150', 'sheet', 20.00::numeric, ARRAY['sand paper #150']),
    ('Sand paper #120', 'sheet', 20.00::numeric, ARRAY['sand paper #120']),
    ('Sand paper #100', 'sheet', 20.00::numeric, ARRAY['sand paper #100']),
    ('Portable grinder', 'unit', 4500.00::numeric, ARRAY['portable grinder']),
    ('Poly Tech CSM', 'pail', 42800.00::numeric, ARRAY['poly tech csm']),
    ('Palette pair 6"', 'pair', 60.00::numeric, ARRAY['palette pair 6"']),
    ('Palette pair 4"', 'pair', 50.00::numeric, ARRAY['palette pair 4"']),
    ('Paint thinner', 'gallon', 320.00::numeric, ARRAY['paint thinner']),
    ('Paint roller 7" w/ handle yellow', 'pcs', 65.00::numeric, ARRAY['paint roller 7" w/ handle yellow']),
    ('Paint roller 7" w/ handle', 'pcs', 100.00::numeric, ARRAY['paint roller 7" w/ handle']),
    ('Paint brush 3"', 'pcs', 65.00::numeric, ARRAY['paint brush 3"']),
    ('Paint brush 2"', 'pcs', 45.00::numeric, ARRAY['paint brush 2"']),
    ('Paint brush 1-1/2"', 'pcs', 40.00::numeric, ARRAY['paint brush 1-1/2"']),
    ('Paint brush 1"', 'pcs', 25.00::numeric, ARRAY['paint brush 1"', 'paint brush']),
    ('Metal Tech EG', 'kit', 16500.00::numeric, ARRAY['metal tech eg']),
    ('Lacquer thinner', 'gallon', 290.00::numeric, ARRAY['lacquer thinner']),
    ('Injection machine', 'unit', 30000.00::numeric, ARRAY['injection machine']),
    ('Hand drill', 'unit', 6500.00::numeric, ARRAY['hand drill']),
    ('Epoxy injection', 'kit', 10000.00::numeric, ARRAY['epoxy injection']),
    ('Empty sacks', 'pcs', 5.00::numeric, ARRAY['empty sacks']),
    ('Cotton rags', 'bundle', 60.00::numeric, ARRAY['cotton rags']),
    ('Chopped strand matt 230', 'roll', 6500.00::numeric, ARRAY['chopped strand matt 230']),
    ('Chipping gun', 'unit', 7500.00::numeric, ARRAY['chipping gun']),
    ('Ceramic Tech FG', 'kg', 16500.00::numeric, ARRAY['ceramic tech fg']),
    ('Ceramic Tech EG', 'kg', 16500.00::numeric, ARRAY['ceramic tech eg']),
    ('Baby roller cotton (white)', 'pcs', 35.00::numeric, ARRAY['baby roller cotton (white)', 'baby roller cotton (yellow)', 'acrylon paint roller 4" filler (white)', 'acrylon paint roller 4" filler white']),
    ('Baby roller cotton 4" w/ handle white', 'pcs', 45.00::numeric, ARRAY['baby roller cotton 4" w/ handle white', 'baby roller cotton 4" w/ handle (white)']),
    ('Acrylon Paint roller 7" w/ handle (White)', 'pcs', 100.00::numeric, ARRAY['acrylon paint roller 7" w/ handle (white)'])
),
matched_products AS (
  SELECT DISTINCT ON (c.item_name)
    c.item_name,
    c.unit,
    c.unit_price,
    c.aliases,
    p.product_id
  FROM catalog c
  JOIN products p ON lower(p.item_name) = ANY(c.aliases)
  ORDER BY c.item_name, (p.deleted_at IS NOT NULL), p.product_id
),
duplicate_products AS (
  SELECT
    p.product_id AS duplicate_product_id,
    m.product_id AS canonical_product_id
  FROM matched_products m
  JOIN products p ON lower(p.item_name) = ANY(m.aliases)
  WHERE p.product_id <> m.product_id
),
relinked_order_items AS (
  UPDATE order_items oi
  SET product_id = d.canonical_product_id
  FROM duplicate_products d
  WHERE oi.product_id = d.duplicate_product_id
  RETURNING oi.order_item_id
),
relinked_client_order_items AS (
  UPDATE client_order_items coi
  SET product_id = d.canonical_product_id
  FROM duplicate_products d
  WHERE coi.product_id = d.duplicate_product_id
  RETURNING coi.item_id
),
relinked_material_request_items AS (
  UPDATE material_request_items mri
  SET product_id = d.canonical_product_id
  FROM duplicate_products d
  WHERE mri.product_id = d.duplicate_product_id
  RETURNING mri.item_id
),
relinked_product_watches AS (
  UPDATE product_watches pw
  SET product_id = d.canonical_product_id
  FROM duplicate_products d
  WHERE pw.product_id = d.duplicate_product_id
  RETURNING pw.watch_id
),
relinked_stock_transactions AS (
  UPDATE stock_transactions st
  SET product_id = d.canonical_product_id
  FROM duplicate_products d
  WHERE st.product_id = d.duplicate_product_id
  RETURNING st.transaction_id
),
updated_products AS (
  UPDATE products p
  SET
    item_name = m.item_name,
    unit = m.unit,
    unit_price = m.unit_price,
    deleted_at = NULL
  FROM matched_products m
  WHERE p.product_id = m.product_id
  RETURNING p.product_id
)
UPDATE products p
SET deleted_at = COALESCE(p.deleted_at, NOW())
FROM duplicate_products d
WHERE p.product_id = d.duplicate_product_id;

UPDATE order_items oi
SET unit_price = p.unit_price
FROM products p
WHERE oi.product_id = p.product_id
  AND p.deleted_at IS NULL;

UPDATE client_order_items coi
SET unit_price = p.unit_price
FROM products p
WHERE coi.product_id = p.product_id
  AND p.deleted_at IS NULL;

WITH totals AS (
  SELECT
    order_id,
    COALESCE(SUM(quantity * unit_price), 0)::numeric(12, 2) AS subtotal
  FROM order_items
  WHERE order_id IS NOT NULL
  GROUP BY order_id
)
UPDATE orders o
SET
  subtotal = t.subtotal,
  vat = ROUND(t.subtotal * 0.12, 2),
  total = ROUND(t.subtotal * 1.12, 2)
FROM totals t
WHERE o.order_id = t.order_id;

WITH totals AS (
  SELECT
    client_order_id,
    COALESCE(SUM(quantity * COALESCE(unit_price, 0)), 0)::numeric(12, 2) AS subtotal
  FROM client_order_items
  WHERE client_order_id IS NOT NULL
  GROUP BY client_order_id
)
UPDATE client_orders co
SET
  subtotal = t.subtotal,
  vat = ROUND(t.subtotal * 0.12, 2),
  total = ROUND(t.subtotal * 1.12, 2),
  updated_at = NOW()
FROM totals t
WHERE co.client_order_id = t.client_order_id;

WITH totals AS (
  SELECT
    mri.request_id,
    COALESCE(SUM(mri.quantity * p.unit_price), 0)::numeric(12, 2) AS est_cost
  FROM material_request_items mri
  JOIN products p ON p.product_id = mri.product_id
  WHERE mri.request_id IS NOT NULL
    AND p.deleted_at IS NULL
  GROUP BY mri.request_id
)
UPDATE material_requests mr
SET est_cost = t.est_cost
FROM totals t
WHERE mr.request_id = t.request_id;
