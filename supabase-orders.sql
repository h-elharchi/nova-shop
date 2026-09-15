-- ============================================
-- NOVA SHOP — Orders system
-- Exécuter dans Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  product_id UUID NOT NULL
    REFERENCES public.products(id)
    ON DELETE RESTRICT,

  product_name TEXT NOT NULL,
  product_price NUMERIC(10,2) NOT NULL,

  customer_first_name TEXT NOT NULL,
  customer_last_name  TEXT NOT NULL,
  customer_phone      TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','contacted','confirmed','cancelled','completed')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS orders_product_id_idx   ON public.orders(product_id);
CREATE INDEX IF NOT EXISTS orders_status_idx        ON public.orders(status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx    ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_customer_phone_idx ON public.orders(customer_phone);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_orders_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS orders_updated_at ON public.orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_orders_updated_at();

-- RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Visiteurs : INSERT uniquement
CREATE POLICY "Public can create orders"
  ON public.orders FOR INSERT
  WITH CHECK (true);

-- Admin : tout
CREATE POLICY "Admin full access to orders"
  ON public.orders FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
