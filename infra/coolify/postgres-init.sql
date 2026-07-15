-- The control plane owns the public tenant/catalog metadata.
-- Commerce data lives in a separate database on the same PostgreSQL instance.
CREATE DATABASE eticart_app OWNER eticart;
