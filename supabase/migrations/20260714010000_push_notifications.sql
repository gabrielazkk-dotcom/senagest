CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  subscription JSONB NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS endpoint TEXT;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.push_subscriptions ALTER COLUMN subscription TYPE JSONB USING subscription::JSONB;

DELETE FROM public.push_subscriptions WHERE user_id IS NULL OR endpoint IS NULL;
ALTER TABLE public.push_subscriptions ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.push_subscriptions ALTER COLUMN endpoint SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_endpoint_key
  ON public.push_subscriptions(user_id, endpoint);
CREATE INDEX IF NOT EXISTS push_subscriptions_enabled_idx
  ON public.push_subscriptions(enabled) WHERE enabled = TRUE;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subscriptions_select_own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_select_own" ON public.push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subscriptions_insert_own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_insert_own" ON public.push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subscriptions_update_own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_update_own" ON public.push_subscriptions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subscriptions_delete_own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_delete_own" ON public.push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.notification_events (
  event_key TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.stock_notification_state (
  product_id UUID PRIMARY KEY REFERENCES public.produtos(id) ON DELETE CASCADE,
  alert_active BOOLEAN NOT NULL DEFAULT FALSE,
  last_notified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.stock_notification_state ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.push_subscriptions IS 'Inscrições Web Push vinculadas a cada usuário e aparelho.';
COMMENT ON TABLE public.notification_events IS 'Chaves de deduplicação de notificações já enviadas.';
COMMENT ON TABLE public.stock_notification_state IS 'Evita repetir alerta enquanto o produto permanece abaixo do mínimo.';
