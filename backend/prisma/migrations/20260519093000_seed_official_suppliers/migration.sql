WITH supplier_data(alias_name, supplier_name, address, tin, contact_person, phone) AS (
  VALUES
    ('Jhelet General Merchandise', 'JHELET GENERAL MERCHANDISING', 'Lot 17 & 18 Martinez St., Brgy Rizal Makati City', '191-017-762-00000', 'Mam Vangie', '09228629686'),
    ('Paco Asia Hardware', 'PACO ASIA PLUMBING SUPPLY AND HARDWARE', '1475 Gen. Luna St., Barangay 676 Zone 73, Dist V 1007, Paco, City of Manila', '140-467-869-0000', 'Mam Susan', '09101937600'),
    ('Davies Marketing', 'Elite Hardware, Electrical & Industrial Supply Co (Davies)', '238 15th Avenue, corner Aurora Boulevard, Cubao, Quezon City, 1109 Philippines', '000-389-799-00000', 'Mam Tess', '09178779302'),
    ('GAZPAC ENTERPRISES CORPORATION', 'GAZPAC ENTERPRISES CORPORATION', '1463 Doroteo Jose St., Barangay 314 Zone 031 1003 Santa Cruz NCR City of Manila', '644-777-972-00000', 'Mam Tery', '09228099952'),
    ('Polymer Products (Phil) Inc', 'Polymer Products (Phil) Inc', '11 Joe Borris St Bagong Ilog, 1604 City of Pasig NCR', '000-281-511-00000', 'Mam Sheng', '09454274426'),
    ('JP Camaro Hardware', 'JP Camaro Construction Supply', '4983 Arnaiz Ave cor. Mayor St., Brgy. Pio Del Pilar Makati City', '605-521-666-00000', 'Mam Liza', '09267527299'),
    ('Knack Commercial', 'Knack Commercial (Kelyn Commercial Corp)', '4996 A. Arnaiz Ave., Brgy. Pio Del Pilar Makati City', NULL, NULL, '09435814433'),
    ('LYS Marketing', 'LYS Marketing Corporation', '187 Roosevelt Ave., Brgy Del Monte 1 Quezon City', '000-365-807-00000', 'Mam Sol', '09171870151'),
    ('Rockwell Lumbr', 'Rockwell Lumber and Hardware Inc', '1159 JP Rizal St. Guadalupe Viejo 1211 City of Makati', '000-167-700-00000', 'Sir Edgar', '09277843280'),
    ('Rockwell Lumber', 'Rockwell Lumber and Hardware Inc', '1159 JP Rizal St. Guadalupe Viejo 1211 City of Makati', '000-167-700-00000', 'Sir Edgar', '09277843280'),
    ('Valqua Industrial', 'Valqua Industrial Corporation', '1007 Tomas Mapua St Brgy 329 Zone 33 Dist III Sta Cruz Manila', '004-827-090-000', 'Mam Kristine', '8-7115103')
),
updated AS (
  UPDATE suppliers s
  SET supplier_name = d.supplier_name,
      country = 'Philippines',
      address = d.address,
      tin = d.tin,
      contact_person = d.contact_person,
      phone = d.phone,
      email = NULL,
      deleted_at = NULL
  FROM supplier_data d
  WHERE lower(s.supplier_name) = lower(d.alias_name)
     OR lower(s.supplier_name) = lower(d.supplier_name)
  RETURNING s.supplier_name
),
official_data(supplier_name, address, tin, contact_person, phone) AS (
  VALUES
    ('JHELET GENERAL MERCHANDISING', 'Lot 17 & 18 Martinez St., Brgy Rizal Makati City', '191-017-762-00000', 'Mam Vangie', '09228629686'),
    ('PACO ASIA PLUMBING SUPPLY AND HARDWARE', '1475 Gen. Luna St., Barangay 676 Zone 73, Dist V 1007, Paco, City of Manila', '140-467-869-0000', 'Mam Susan', '09101937600'),
    ('Elite Hardware, Electrical & Industrial Supply Co (Davies)', '238 15th Avenue, corner Aurora Boulevard, Cubao, Quezon City, 1109 Philippines', '000-389-799-00000', 'Mam Tess', '09178779302'),
    ('GAZPAC ENTERPRISES CORPORATION', '1463 Doroteo Jose St., Barangay 314 Zone 031 1003 Santa Cruz NCR City of Manila', '644-777-972-00000', 'Mam Tery', '09228099952'),
    ('Polymer Products (Phil) Inc', '11 Joe Borris St Bagong Ilog, 1604 City of Pasig NCR', '000-281-511-00000', 'Mam Sheng', '09454274426'),
    ('JP Camaro Construction Supply', '4983 Arnaiz Ave cor. Mayor St., Brgy. Pio Del Pilar Makati City', '605-521-666-00000', 'Mam Liza', '09267527299'),
    ('Knack Commercial (Kelyn Commercial Corp)', '4996 A. Arnaiz Ave., Brgy. Pio Del Pilar Makati City', NULL, NULL, '09435814433'),
    ('LYS Marketing Corporation', '187 Roosevelt Ave., Brgy Del Monte 1 Quezon City', '000-365-807-00000', 'Mam Sol', '09171870151'),
    ('Rockwell Lumber and Hardware Inc', '1159 JP Rizal St. Guadalupe Viejo 1211 City of Makati', '000-167-700-00000', 'Sir Edgar', '09277843280'),
    ('Valqua Industrial Corporation', '1007 Tomas Mapua St Brgy 329 Zone 33 Dist III Sta Cruz Manila', '004-827-090-000', 'Mam Kristine', '8-7115103')
)
INSERT INTO suppliers (supplier_name, country, address, tin, contact_person, phone, email)
SELECT d.supplier_name, 'Philippines', d.address, d.tin, d.contact_person, d.phone, NULL
FROM official_data d
WHERE NOT EXISTS (
  SELECT 1 FROM suppliers s WHERE lower(s.supplier_name) = lower(d.supplier_name)
);
