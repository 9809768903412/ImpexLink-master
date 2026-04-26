DO $$
DECLARE
  admin_id INTEGER;
  sales_agent_id INTEGER;
BEGIN
  SELECT role_id INTO admin_id FROM roles WHERE role_name = 'ADMIN';
  SELECT role_id INTO sales_agent_id FROM roles WHERE role_name = 'SALES_AGENT';

  IF admin_id IS NOT NULL THEN
    UPDATE users
    SET role_id = admin_id
    WHERE lower(full_name) LIKE '%josephine%'
      OR lower(email) LIKE '%josephine%'
      OR lower(full_name) LIKE '%mama%'
      OR lower(email) LIKE '%mama%';

    DELETE FROM user_roles
    WHERE user_id IN (
      SELECT user_id
      FROM users
      WHERE lower(full_name) LIKE '%josephine%'
        OR lower(email) LIKE '%josephine%'
        OR lower(full_name) LIKE '%mama%'
        OR lower(email) LIKE '%mama%'
    );

    INSERT INTO user_roles (user_id, role_id)
    SELECT user_id, admin_id
    FROM users
    WHERE lower(full_name) LIKE '%josephine%'
      OR lower(email) LIKE '%josephine%'
      OR lower(full_name) LIKE '%mama%'
      OR lower(email) LIKE '%mama%'
    ON CONFLICT DO NOTHING;
  END IF;

  IF sales_agent_id IS NOT NULL THEN
    UPDATE users
    SET role_id = sales_agent_id
    WHERE lower(full_name) LIKE '%lita%'
      OR lower(email) LIKE '%lita%';

    DELETE FROM user_roles
    WHERE user_id IN (
      SELECT user_id
      FROM users
      WHERE lower(full_name) LIKE '%lita%'
        OR lower(email) LIKE '%lita%'
    );

    INSERT INTO user_roles (user_id, role_id)
    SELECT user_id, sales_agent_id
    FROM users
    WHERE lower(full_name) LIKE '%lita%'
      OR lower(email) LIKE '%lita%'
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
