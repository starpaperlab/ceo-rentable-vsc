-- ═══════════════════════════════════════════════════════════════
-- CEO RENTABLE OS™ — CONFIGURACIÓN SUPABASE
-- Ejecuta este archivo en: Database → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1️⃣ TABLA: CLIENTS (Clientes)
-- ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  total_spent DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_clients_user_id ON clients(user_id);
CREATE INDEX idx_clients_email ON clients(email);

-- RLS: Cada usuario solo ve sus propios clientes
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own clients" 
  ON clients FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own clients" 
  ON clients FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clients" 
  ON clients FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clients" 
  ON clients FOR DELETE 
  USING (auth.uid() = user_id);


-- ───────────────────────────────────────────────────────────────
-- 2️⃣ TABLA: SUBSCRIPTIONS (Suscripciones)
-- ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  plan TEXT NOT NULL CHECK (plan IN ('basico', 'pro')),
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'incomplete')),
  current_period_start DATE,
  current_period_end DATE,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  canceled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_customer_id ON subscriptions(stripe_customer_id);

-- RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscription" 
  ON subscriptions FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscription" 
  ON subscriptions FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ───────────────────────────────────────────────────────────────
-- 3️⃣ TABLA: TRANSACTIONS (Transacciones de Pago)
-- ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_payment_id TEXT,
  stripe_invoice_id TEXT,
  amount DECIMAL(12,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'pending', 'failed', 'refunded')),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_stripe_id ON transactions(stripe_payment_id);
CREATE INDEX idx_transactions_status ON transactions(status);

-- RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own transactions" 
  ON transactions FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transactions" 
  ON transactions FOR INSERT 
  WITH CHECK (auth.uid() = user_id);


-- ───────────────────────────────────────────────────────────────
-- 4️⃣ TABLA: EMAIL_LOGS (Registro de Emails Enviados)
-- ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('welcome', 'payment_confirmation', 'subscription_expiring', 'password_reset', 'broadcast', 'reminder', 'other')),
  to_email TEXT NOT NULL,
  subject TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'bounced')),
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  opened_at TIMESTAMP WITH TIME ZONE,
  clicked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_email_logs_user_id ON email_logs(user_id);
CREATE INDEX idx_email_logs_type ON email_logs(type);
CREATE INDEX idx_email_logs_to_email ON email_logs(to_email);
CREATE INDEX idx_email_logs_status ON email_logs(status);

-- RLS
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own email logs" 
  ON email_logs FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own email logs" 
  ON email_logs FOR INSERT 
  WITH CHECK (auth.uid() = user_id);


-- ───────────────────────────────────────────────────────────────
-- 5️⃣ TABLA: EMAIL_TEMPLATES (Plantillas de Email)
-- ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  variables TEXT DEFAULT '[]', -- JSON array de variables disponibles
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_email_templates_user_id ON email_templates(user_id);
CREATE INDEX idx_email_templates_type ON email_templates(type);

-- RLS
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own templates" 
  ON email_templates FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own templates" 
  ON email_templates FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own templates" 
  ON email_templates FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own templates" 
  ON email_templates FOR DELETE 
  USING (auth.uid() = user_id);


-- ───────────────────────────────────────────────────────────────
-- 6️⃣ TABLA: USERS (Perfil extendido)
-- Nota: auth.users ya existe. Esta tabla es para datos adicionales.
-- ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  business_name TEXT,
  business_type TEXT,
  currency TEXT DEFAULT 'USD',
  language TEXT DEFAULT 'es',
  timezone TEXT DEFAULT 'UTC',
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  plan TEXT DEFAULT 'basico' CHECK (plan IN ('basico', 'pro', 'free')),
  has_access BOOLEAN DEFAULT FALSE,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- RLS (slight modification - users can see their own profile)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" 
  ON users FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
  ON users FOR UPDATE 
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- ───────────────────────────────────────────────────────────────
-- 7️⃣ TABLA: INVOICES (Facturas - Supabase actualizada)
-- Nota: Verificar si existe, si no, crearla
-- ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  due_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'paid', 'overdue', 'canceled')),
  subtotal DECIMAL(12,2) DEFAULT 0,
  tax DECIMAL(12,2) DEFAULT 0,
  total_final DECIMAL(12,2) DEFAULT 0,
  total_ingresos DECIMAL(12,2) DEFAULT 0,
  total_costos DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  reminder_sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_invoices_user_id ON invoices(user_id);
CREATE INDEX idx_invoices_client_id ON invoices(client_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_date ON invoices(date);

-- RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own invoices" 
  ON invoices FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own invoices" 
  ON invoices FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own invoices" 
  ON invoices FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own invoices" 
  ON invoices FOR DELETE 
  USING (auth.uid() = user_id);


-- ───────────────────────────────────────────────────────────────
-- 8️⃣ TABLA: PRODUCTS (Productos - Actualizar si existe)
-- ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT,
  sale_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  costo_unitario DECIMAL(12,2) DEFAULT 0,
  margin_pct DECIMAL(5,2),
  net_profit DECIMAL(12,2),
  current_stock INTEGER DEFAULT 0,
  min_stock_alert INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'discontinued')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_products_user_id ON products(user_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_sku ON products(sku);

-- RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own products" 
  ON products FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own products" 
  ON products FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own products" 
  ON products FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own products" 
  ON products FOR DELETE 
  USING (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════
-- TRIGGERS: Actualizar updated_at automáticamente
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a todas las tablas que lo necesitan
CREATE TRIGGER update_clients_updated_at 
  BEFORE UPDATE ON clients FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at 
  BEFORE UPDATE ON subscriptions FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at 
  BEFORE UPDATE ON email_templates FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON users FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at 
  BEFORE UPDATE ON invoices FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at 
  BEFORE UPDATE ON products FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();


-- ═══════════════════════════════════════════════════════════════
-- INSERTS DE EJEMPLO (Comentados)
-- ═══════════════════════════════════════════════════════════════

-- Para usar, reemplaza 'YOUR_USER_ID' con un UUID real de auth.users
/*

-- INSERT clients
INSERT INTO clients (user_id, name, email, phone, status)
VALUES (
  'YOUR_USER_ID', 
  'Acme Corporation',
  'contact@acme.com',
  '+1-555-0123',
  'active'
);

-- INSERT email_templates  
INSERT INTO email_templates (user_id, name, type, subject, html_body, variables)
VALUES (
  'YOUR_USER_ID',
  'Bienvenida',
  'welcome',
  'Bienvenida a CEO Rentable OS™',
  '<h1>Hola {{name}}</h1><p>Gracias por registrarte.</p>',
  '[{"name":"name","label":"Nombre del usuario"}]'
);

*/
