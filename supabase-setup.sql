-- =============================================================================
-- CEO RENTABLE OS™ - SCHEMA SUPABASE COMPLETO
-- =============================================================================

-- 1. TABLA DE USUARIOS (extendida de auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(255),
  phone VARCHAR(20),
  role VARCHAR(50) NOT NULL DEFAULT 'user', -- 'user' | 'admin'
  plan VARCHAR(50) NOT NULL DEFAULT 'founder', -- 'founder' | 'subscription' | 'admin'
  has_access BOOLEAN DEFAULT FALSE,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  
  -- Features según plan
  luna_access BOOLEAN DEFAULT FALSE,
  automatizaciones_access BOOLEAN DEFAULT FALSE,
  nuevas_funciones_access BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP -- Para founder lifetime o subscriptions
);

-- 2. TABLA DE PLANES
CREATE TABLE IF NOT EXISTS public.plans (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE, -- 'founder', 'subscription', 'admin'
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2),
  billing_period VARCHAR(50), -- 'lifetime', 'monthly', 'annual'
  stripe_product_id VARCHAR(255),
  stripe_price_id VARCHAR(255),
  features JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABLA DE SUSCRIPCIONES / PAGOS
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan_id INTEGER REFERENCES public.plans(id),
  stripe_subscription_id VARCHAR(255) UNIQUE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'active', 'canceled', 'expired'
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. TABLA DE PAGOS
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  stripe_payment_id VARCHAR(255) UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'succeeded', 'failed'
  receipt_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. TABLA DE PLANTILLAS DE EMAIL
CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  subject VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  html_body TEXT,
  variables JSONB DEFAULT '[]', -- ['{{name}}', '{{email}}', '{{phone}}']
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. TABLA DE LOGS DE EMAIL
CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.email_templates(id),
  recipient_email VARCHAR(255) NOT NULL,
  subject VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'sent', 'failed', 'bounced'
  error_message TEXT,
  resend_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP
);

-- 7. TABLA DE CAMPAÑAS DE EMAIL (tipo Mailchimp)
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.email_templates(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  target_plan VARCHAR(50), -- Null para todos, o especificar 'founder', 'subscription', 'admin'
  recipients_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'draft', -- 'draft', 'scheduled', 'sending', 'completed'
  scheduled_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. TABLA DE AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  target_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- INDICES
-- =============================================================================

CREATE INDEX idx_users_role ON public.users(role);
CREATE INDEX idx_users_plan ON public.users(plan);
CREATE INDEX idx_users_stripe_customer ON public.users(stripe_customer_id);
CREATE INDEX idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX idx_email_logs_user ON public.email_logs(user_id);
CREATE INDEX idx_email_logs_status ON public.email_logs(status);
CREATE INDEX idx_campaigns_admin ON public.email_campaigns(admin_id);
CREATE INDEX idx_audit_logs_admin ON public.audit_logs(admin_id);
CREATE INDEX idx_audit_logs_target_user ON public.audit_logs(target_user_id);

-- =============================================================================
-- INSERTS INICIALES
-- =============================================================================

INSERT INTO public.plans (name, display_name, description, price, billing_period, features)
VALUES 
  ('founder', '🏅 Founder', 'Acceso de por vida para founder', 0, 'lifetime', '{"luna": true, "automatizaciones": false, "nuevas_funciones": false}'),
  ('subscription', '⭐ Subscription', 'Acceso completo con nuevas funciones', 49.99, 'monthly', '{"luna": true, "automatizaciones": true, "nuevas_funciones": true}'),
  ('admin', '🛡 Admin', 'Panel de administración completo', 0, 'lifetime', '{"luna": true, "automatizaciones": true, "nuevas_funciones": true, "admin_panel": true}')
ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Users puede ver su propio perfil
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT USING (auth.uid() = id);

-- Admin puede ver todos los usuarios
CREATE POLICY "Admin can view all users" ON public.users FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- Admin puede actualizar usuarios
CREATE POLICY "Admin can update users" ON public.users FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- Email templates - todos pueden leer
CREATE POLICY "Everyone can read templates" ON public.email_templates FOR SELECT USING (true);

-- Admin puede crear/actualizar templates
CREATE POLICY "Admin can manage templates" ON public.email_templates FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- =============================================================================
-- FUNCIONES TRIGGER
-- =============================================================================

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION public.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_timestamp BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

CREATE TRIGGER update_subscriptions_timestamp BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

CREATE TRIGGER update_email_templates_timestamp BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
