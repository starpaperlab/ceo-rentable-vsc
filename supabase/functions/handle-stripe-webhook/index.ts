/**
 * ═══════════════════════════════════════════════════════════════
 * CEO RENTABLE OS™ — STRIPE WEBHOOK HANDLER
 * ═══════════════════════════════════════════════════════════════
 *
 * Edge Function que procesa webhooks de Stripe:
 * - invoice.payment_succeeded ✅ Activa subscription + acceso
 * - invoice.payment_failed ❌ Marca como past_due
 * - customer.subscription.deleted 🗑️ Cancela subscription
 * - charge.refunded 💰 Registra refund
 *
 * Observabilidad en modo observación:
 * - public.stripe_events (best-effort, sin enforcement)
 * - request_id por ejecución
 * - detección de replay por stripe_event_id
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13.0.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase env variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
const stripWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

if (!stripeSecretKey || !stripWebhookSecret) {
  throw new Error('Missing Stripe env variables');
}

const stripe = new Stripe(stripeSecretKey);

type HandlerResult = {
  ok: boolean;
  userId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

type ReducedStripePayload = {
  id: string | null;
  type: string | null;
  livemode: boolean;
  created: number | null;
  object: {
    id: string | null;
    customer: string | null;
    subscription: string | null;
    invoice: string | null;
    payment_intent: string | null;
    charge: string | null;
    amount_paid: number | null;
    amount_due: number | null;
    amount_refunded: number | null;
    currency: string | null;
    status: string | null;
  };
};

function nowIso() {
  return new Date().toISOString();
}

function parseHeaderValue(req: Request, key: string): string {
  return `${req.headers.get(key) || ''}`.trim();
}

function resolveRequestId(req: Request): string {
  const fromRequestId = parseHeaderValue(req, 'x-request-id');
  if (fromRequestId) return fromRequestId;

  const fromCorrelation = parseHeaderValue(req, 'x-correlation-id');
  if (fromCorrelation) return fromCorrelation;

  return crypto.randomUUID();
}

const SANITIZE_MAX_LEN = 300;
const EMAIL_MASK_REGEX = /\b([A-Z0-9._%+-]{1,64})@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
const BEARER_MASK_REGEX = /(bearer\s+)[a-z0-9\-._~+/]+=*/gi;
const JWT_MASK_REGEX = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const API_KEY_MASK_REGEX = /\b(sk_(live|test)_[A-Za-z0-9]+|re_[A-Za-z0-9._-]+|AIza[0-9A-Za-z\-_]{20,})\b/g;
const TOKEN_ASSIGNMENT_REGEX = /\b(token|access_token|refresh_token|api[_-]?key|authorization)\s*[:=]\s*["']?([A-Za-z0-9\-._~+/=]{8,})["']?/gi;

function sanitizeText(value: unknown): string {
  try {
    let sanitized = `${value ?? ''}`;
    sanitized = sanitized.replace(EMAIL_MASK_REGEX, (_, local, domain) => {
      const safeLocal = `${local}`.length <= 2 ? '**' : `${`${local}`.slice(0, 2)}***`;
      return `${safeLocal}@${domain}`;
    });
    sanitized = sanitized.replace(BEARER_MASK_REGEX, '$1***');
    sanitized = sanitized.replace(JWT_MASK_REGEX, '[JWT_MASKED]');
    sanitized = sanitized.replace(API_KEY_MASK_REGEX, '[API_KEY_MASKED]');
    sanitized = sanitized.replace(TOKEN_ASSIGNMENT_REGEX, '$1=[MASKED]');

    if (sanitized.length > SANITIZE_MAX_LEN) {
      sanitized = `${sanitized.slice(0, SANITIZE_MAX_LEN)}...[truncated]`;
    }
    return sanitized;
  } catch (_) {
    return '[SANITIZE_FAILED]';
  }
}

function safeValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return sanitizeText(value);
  if (typeof value === 'object') return sanitizeText(JSON.stringify(value));
  return value;
}

function observeLog(eventName: string, payload: Record<string, unknown> = {}, level: 'info' | 'warn' | 'error' = 'info') {
  try {
    const safePayload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      safePayload[key] = safeValue(value);
    }

    const line = JSON.stringify({
      event_name: eventName,
      timestamp: nowIso(),
      ...safePayload,
    });

    if (level === 'error') {
      console.error(line);
      return;
    }
    if (level === 'warn') {
      console.warn(line);
      return;
    }
    console.log(line);
  } catch (_) {
    // Best-effort: no romper flujo por observabilidad
  }
}

function toIsoFromEpoch(epochSeconds: unknown): string | null {
  const numeric = Number(epochSeconds);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return new Date(numeric * 1000).toISOString();
}

function extractStripeRefs(event: any) {
  const obj = event?.data?.object || {};
  return {
    customer_id: typeof obj.customer === 'string' ? obj.customer : null,
    subscription_id: typeof obj.subscription === 'string' ? obj.subscription : null,
    invoice_id:
      typeof obj.invoice === 'string'
        ? obj.invoice
        : typeof obj.id === 'string' && event?.type?.startsWith?.('invoice.')
          ? obj.id
          : null,
    payment_intent_id: typeof obj.payment_intent === 'string' ? obj.payment_intent : null,
    charge_id: typeof obj.charge === 'string' ? obj.charge : typeof obj.id === 'string' && event?.type === 'charge.refunded' ? obj.id : null,
  };
}

function buildPayloadReduced(event: any): ReducedStripePayload {
  const obj = event?.data?.object || {};
  return {
    id: typeof event?.id === 'string' ? event.id : null,
    type: typeof event?.type === 'string' ? event.type : null,
    livemode: Boolean(event?.livemode),
    created: Number.isFinite(Number(event?.created)) ? Number(event.created) : null,
    object: {
      id: typeof obj?.id === 'string' ? obj.id : null,
      customer: typeof obj?.customer === 'string' ? obj.customer : null,
      subscription: typeof obj?.subscription === 'string' ? obj.subscription : null,
      invoice: typeof obj?.invoice === 'string' ? obj.invoice : null,
      payment_intent: typeof obj?.payment_intent === 'string' ? obj.payment_intent : null,
      charge: typeof obj?.charge === 'string' ? obj.charge : null,
      amount_paid: Number.isFinite(Number(obj?.amount_paid)) ? Number(obj.amount_paid) : null,
      amount_due: Number.isFinite(Number(obj?.amount_due)) ? Number(obj.amount_due) : null,
      amount_refunded: Number.isFinite(Number(obj?.amount_refunded)) ? Number(obj.amount_refunded) : null,
      currency: typeof obj?.currency === 'string' ? obj.currency : null,
      status: typeof obj?.status === 'string' ? obj.status : null,
    },
  };
}

function isUniqueViolation(error: any): boolean {
  const code = `${error?.code || ''}`.trim();
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return code === '23505' || message.includes('duplicate key');
}

async function observeReceived(event: any, requestId: string) {
  const receivedAt = nowIso();
  const refs = extractStripeRefs(event);
  const insertPayload = {
    stripe_event_id: `${event?.id || ''}`,
    event_type: `${event?.type || 'unknown'}`,
    livemode: Boolean(event?.livemode),
    status: 'received',
    attempt_count: 1,
    request_id: requestId,
    first_received_at: receivedAt,
    last_received_at: receivedAt,
    processing_started_at: null,
    processed_at: null,
    last_error_at: null,
    event_created_at: toIsoFromEpoch(event?.created),
    ...refs,
    user_id: null,
    is_replay: false,
    last_http_status: null,
    error_code: null,
    error_message_sanitized: null,
    payload_reduced: buildPayloadReduced(event),
    updated_at: receivedAt,
  };

  const { error } = await supabase.from('stripe_events').insert(insertPayload);
  if (!error) {
    return { isReplay: false, attemptCount: 1 };
  }

  if (!isUniqueViolation(error)) {
    throw error;
  }

  const { data: existing, error: existingError } = await supabase
    .from('stripe_events')
    .select('attempt_count')
    .eq('stripe_event_id', `${event?.id || ''}`)
    .maybeSingle();

  if (existingError) throw existingError;

  const nextAttempt = Math.max(1, Number(existing?.attempt_count || 1)) + 1;
  const replayPatch = {
    event_type: `${event?.type || 'unknown'}`,
    livemode: Boolean(event?.livemode),
    status: 'replayed_observed',
    attempt_count: nextAttempt,
    request_id: requestId,
    last_received_at: receivedAt,
    event_created_at: toIsoFromEpoch(event?.created),
    ...refs,
    is_replay: true,
    payload_reduced: buildPayloadReduced(event),
    updated_at: receivedAt,
  };

  const { error: replayError } = await supabase
    .from('stripe_events')
    .update(replayPatch)
    .eq('stripe_event_id', `${event?.id || ''}`);

  if (replayError) throw replayError;

  return { isReplay: true, attemptCount: nextAttempt };
}

async function observeStatus(eventId: string, patch: Record<string, unknown>) {
  const { error } = await supabase
    .from('stripe_events')
    .update({
      ...patch,
      updated_at: nowIso(),
    })
    .eq('stripe_event_id', eventId);

  if (error) throw error;
}

async function safeObserveReceived(event: any, requestId: string) {
  try {
    return await observeReceived(event, requestId);
  } catch (error) {
    observeLog(
      'stripe.webhook.observation_error',
      {
        request_id: requestId,
        stripe_event_id: event?.id || null,
        event_type: event?.type || null,
        stage: 'received',
        error_message: sanitizeText(error instanceof Error ? error.message : `${error}`),
      },
      'warn'
    );
    return null;
  }
}

async function safeObserveStatus(eventId: string | null, patch: Record<string, unknown>, requestId: string) {
  if (!eventId) return;
  try {
    await observeStatus(eventId, patch);
  } catch (error) {
    observeLog(
      'stripe.webhook.observation_error',
      {
        request_id: requestId,
        stripe_event_id: eventId,
        stage: 'status_update',
        error_message: sanitizeText(error instanceof Error ? error.message : `${error}`),
      },
      'warn'
    );
  }
}

async function verifyStripeSignature(body: string, signature: string): Promise<{ verified: boolean; event?: any }> {
  try {
    const event = (await stripe.webhooks.constructEventAsync(body, signature, stripWebhookSecret)) as any;
    return { verified: true, event };
  } catch (err) {
    console.error('❌ Stripe signature verification failed:', err);
    return { verified: false };
  }
}

const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_RESEND_FROM = 'Notificaciones CEO Rentable <notificaciones@ceorentable.com>';
const APP_BASE_URL =
  `${Deno.env.get('APP_URL') || Deno.env.get('VITE_APP_URL') || 'https://app.ceorentable.com'}`.replace(/\/+$/, '');

function normalizeEmail(value: unknown): string | null {
  const normalized = `${value || ''}`.trim().toLowerCase();
  return normalized || null;
}

function extractMissingColumn(error: any): string | null {
  const message = `${error?.message || ''} ${error?.details || ''}`;
  const schemaCacheMatch = message.match(/could not find the '([^']+)' column/i);
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];

  const postgresMatch = message.match(/column\s+["']?([a-zA-Z0-9_.]+)["']?\s+does not exist/i);
  if (!postgresMatch?.[1]) return null;

  const raw = postgresMatch[1];
  const chunks = raw.split('.');
  return chunks[chunks.length - 1] || null;
}

function isMissingColumnError(error: any, column: string): boolean {
  const missing = extractMissingColumn(error);
  return missing === column;
}

function stripUndefined<T extends Record<string, unknown>>(payload: T): T {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined)) as T;
}

async function findUserByStripeCustomerId(customerId: string | null) {
  if (!customerId) return null;
  const { data, error } = await supabase
    .from('users')
    .select('id, email, full_name, business_name, role, plan, has_access, stripe_customer_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function findUserById(userId: string | null) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('users')
    .select('id, email, full_name, business_name, role, plan, has_access, stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function findUserByEmail(email: string | null) {
  if (!email) return null;
  const { data, error } = await supabase
    .from('users')
    .select('id, email, full_name, business_name, role, plan, has_access, stripe_customer_id')
    .ilike('email', email)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  let page = 1;
  const perPage = 200;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    if (!users.length) break;

    const found = users.find((item) => normalizeEmail(item.email) === email);
    if (found?.id) return found.id;

    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

async function createAuthUserForStripeBuyer(email: string, fullName: string | null): Promise<string> {
  const tempPassword = `Tmp-${crypto.randomUUID()}-A1!`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: fullName || undefined,
      source: 'stripe_webhook_auto',
    },
  });

  if (!error && data?.user?.id) {
    return data.user.id;
  }

  const authUserId = await findAuthUserIdByEmail(email);
  if (authUserId) return authUserId;

  throw new Error(error?.message || 'No se pudo crear usuaria auth para pago Stripe');
}

async function upsertPublicUserForStripeBuyer(input: {
  userId: string;
  email: string;
  fullName: string | null;
  customerId: string | null;
}) {
  const payload = stripUndefined({
    id: input.userId,
    email: input.email,
    full_name: input.fullName || null,
    role: 'user',
    plan: 'subscription',
    has_access: true,
    onboarding_completed: false,
    stripe_customer_id: input.customerId || undefined,
    updated_at: nowIso(),
  });

  const { data, error } = await supabase
    .from('users')
    .upsert(payload, { onConflict: 'id' })
    .select('id, email, full_name, business_name, role, plan, has_access, stripe_customer_id')
    .single();

  if (!error) return data;

  const missing = extractMissingColumn(error);
  if (missing && Object.prototype.hasOwnProperty.call(payload, missing)) {
    const fallback = { ...payload };
    delete (fallback as Record<string, unknown>)[missing];
    const retry = await supabase
      .from('users')
      .upsert(fallback, { onConflict: 'id' })
      .select('id, email, full_name, business_name, role, plan, has_access, stripe_customer_id')
      .single();
    if (!retry.error) return retry.data;
    throw retry.error;
  }

  throw error;
}

async function ensureStripeCustomerMapping(userId: string, customerId: string | null) {
  if (!customerId) return;

  const existingOwner = await findUserByStripeCustomerId(customerId);
  if (existingOwner && existingOwner.id !== userId) {
    throw new Error(`stripe_customer_id ya pertenece a otra usuaria (${existingOwner.id})`);
  }

  const { data: currentUser, error: currentError } = await supabase
    .from('users')
    .select('id, stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();
  if (currentError) throw currentError;

  if (!currentUser) throw new Error('No se encontró usuaria para mapear stripe_customer_id');
  if (currentUser.stripe_customer_id && currentUser.stripe_customer_id !== customerId) {
    throw new Error('La usuaria ya tiene un stripe_customer_id distinto');
  }
  if (currentUser.stripe_customer_id === customerId) return;

  const { error: updateError } = await supabase
    .from('users')
    .update({ stripe_customer_id: customerId, updated_at: nowIso() })
    .eq('id', userId);
  if (updateError) throw updateError;
}

async function fetchStripeCustomerEmail(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer || (customer as any).deleted) return null;
    return normalizeEmail((customer as any).email);
  } catch (_) {
    return null;
  }
}

function extractBuyerIdentity(event: any) {
  const invoice = event?.data?.object || {};
  const metadata = invoice?.metadata || {};
  const nestedMetadata = invoice?.parent?.subscription_details?.metadata || {};

  const planRaw = `${metadata.plan || metadata.plan_code || nestedMetadata.plan || nestedMetadata.plan_code || 'subscription'}`.trim();
  const normalizedPlan = planRaw || 'subscription';

  return {
    eventId: `${event?.id || ''}`.trim(),
    invoice,
    customerId: typeof invoice?.customer === 'string' ? invoice.customer : null,
    subscriptionId: typeof invoice?.subscription === 'string' ? invoice.subscription : null,
    invoiceId: typeof invoice?.id === 'string' ? invoice.id : null,
    paymentIntentId: typeof invoice?.payment_intent === 'string' ? invoice.payment_intent : null,
    amountPaid: Number.isFinite(Number(invoice?.amount_paid)) ? Number(invoice.amount_paid) / 100 : 0,
    currency: `${invoice?.currency || 'USD'}`.toUpperCase(),
    periodStartIso: toIsoFromEpoch(invoice?.period_start),
    periodEndIso: toIsoFromEpoch(invoice?.period_end),
    userIdFromMetadata: `${metadata.user_id || metadata.userId || nestedMetadata.user_id || ''}`.trim() || null,
    emailFromMetadata: normalizeEmail(metadata.email || metadata.user_email || nestedMetadata.email),
    emailFromInvoice: normalizeEmail(invoice?.customer_email || invoice?.customer_details?.email),
    fullName:
      `${metadata.full_name || metadata.name || invoice?.customer_name || invoice?.customer_details?.name || ''}`.trim() ||
      null,
    planCode: normalizedPlan,
  };
}

async function upsertSubscriptionForUser(input: {
  userId: string;
  customerId: string | null;
  subscriptionId: string | null;
  planCode: string;
  periodStartIso: string | null;
  periodEndIso: string | null;
}) {
  const basePayload = stripUndefined({
    user_id: input.userId,
    stripe_customer_id: input.customerId || undefined,
    stripe_subscription_id: input.subscriptionId || undefined,
    plan_code: input.planCode,
    status: 'active',
    current_period_start: input.periodStartIso || undefined,
    current_period_end: input.periodEndIso || undefined,
    cancel_at_period_end: false,
    canceled_at: null,
    updated_at: nowIso(),
  });

  const attempts = [
    basePayload,
    stripUndefined({
      ...basePayload,
      plan: (basePayload as any).plan_code,
      plan_code: undefined,
    }),
  ];

  for (const payload of attempts) {
    const { error } = await supabase.from('subscriptions').upsert(payload, { onConflict: 'user_id' });
    if (!error) return;

    const missing = extractMissingColumn(error);
    if (missing && Object.prototype.hasOwnProperty.call(payload, missing)) {
      delete (payload as Record<string, unknown>)[missing];
      const retry = await supabase.from('subscriptions').upsert(payload, { onConflict: 'user_id' });
      if (!retry.error) return;
      if (extractMissingColumn(retry.error) !== missing) throw retry.error;
      continue;
    }
    throw error;
  }

  throw new Error('No se pudo guardar la suscripción en modo compatible');
}

async function insertTransactionIdempotent(input: {
  userId: string;
  stripeEventId: string;
  stripePaymentId: string | null;
  stripeInvoiceId: string | null;
  amount: number;
  currency: string;
  description: string;
}) {
  let supportsStripeEventId = true;

  const existingByEvent = await supabase
    .from('transactions')
    .select('id')
    .eq('stripe_event_id', input.stripeEventId)
    .maybeSingle();

  if (existingByEvent.error) {
    if (isMissingColumnError(existingByEvent.error, 'stripe_event_id')) {
      supportsStripeEventId = false;
    } else {
      throw existingByEvent.error;
    }
  } else if (existingByEvent.data?.id) {
    return { inserted: false, reason: 'replay_event' };
  }

  if (!supportsStripeEventId && input.stripePaymentId) {
    const existingByPayment = await supabase
      .from('transactions')
      .select('id')
      .eq('stripe_payment_id', input.stripePaymentId)
      .maybeSingle();
    if (!existingByPayment.error && existingByPayment.data?.id) {
      return { inserted: false, reason: 'replay_payment' };
    }
  }

  const basePayload = stripUndefined({
    user_id: input.userId,
    stripe_event_id: supportsStripeEventId ? input.stripeEventId : undefined,
    stripe_payment_id: input.stripePaymentId || undefined,
    stripe_invoice_id: input.stripeInvoiceId || undefined,
    amount: input.amount,
    currency: input.currency || 'USD',
    status: 'succeeded',
    description: input.description,
    updated_at: nowIso(),
    created_at: nowIso(),
  });

  const insertOnce = async (payload: Record<string, unknown>) => {
    const { error } = await supabase.from('transactions').insert(payload);
    return error;
  };

  const tryInsertWithMissingColumnFallback = async (payload: Record<string, unknown>) => {
    const mutablePayload = { ...payload };
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const error = await insertOnce(mutablePayload);
      if (!error) return null;
      const missing = extractMissingColumn(error);
      if (missing && Object.prototype.hasOwnProperty.call(mutablePayload, missing)) {
        delete mutablePayload[missing];
        continue;
      }
      return error;
    }
    return new Error('No se pudo insertar transacción en modo compatible');
  };

  let insertError = await tryInsertWithMissingColumnFallback(basePayload);
  if (!insertError) return { inserted: true, reason: 'inserted' };

  if (isUniqueViolation(insertError)) {
    return { inserted: false, reason: 'unique_conflict' };
  }

  const errorMessage = `${insertError?.message || ''} ${insertError?.details || ''}`.toLowerCase();
  if (insertError?.code === '23514' || errorMessage.includes('check constraint')) {
    const fallbackPayload = { ...basePayload, status: 'completed' };
    insertError = await tryInsertWithMissingColumnFallback(fallbackPayload);
    if (!insertError || isUniqueViolation(insertError)) {
      return { inserted: !insertError, reason: insertError ? 'unique_conflict' : 'inserted' };
    }
  }

  throw insertError;
}

async function createOrRefreshActivationInvitation(input: {
  email: string;
  fullName: string | null;
  plan: string;
}): Promise<string | null> {
  try {
    const invitationToken = crypto.randomUUID().replace(/-/g, '');
    const invitationLink = `${APP_BASE_URL}/activar-acceso?invite=${encodeURIComponent(invitationToken)}&email=${encodeURIComponent(input.email)}`;
    const now = nowIso();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: existing, error: findError } = await supabase
      .from('user_invitations')
      .select('id, sent_count')
      .ilike('email', input.email)
      .maybeSingle();

    if (findError) return invitationLink;

    const payload = {
      email: input.email,
      full_name: input.fullName,
      role: 'user',
      plan: input.plan || 'subscription',
      has_access: true,
      invitation_token: invitationToken,
      invitation_link: invitationLink,
      status: 'pending',
      sent_count: Number(existing?.sent_count || 0) + 1,
      last_sent_at: now,
      expires_at: expiresAt,
      updated_at: now,
    };

    if (existing?.id) {
      const { error } = await supabase.from('user_invitations').update(payload).eq('id', existing.id);
      if (error) return invitationLink;
      return invitationLink;
    }

    const { error } = await supabase.from('user_invitations').insert(payload);
    if (error) return invitationLink;
    return invitationLink;
  } catch (_) {
    return null;
  }
}

async function sendPostPaymentEmailBestEffort(input: {
  userId: string;
  email: string | null;
  fullName: string | null;
  amount: number;
  currency: string;
  plan: string;
  activationLink: string | null;
}) {
  const toEmail = normalizeEmail(input.email);
  if (!toEmail) return;

  const resendApiKey = `${Deno.env.get('RESEND_API_KEY') || ''}`.trim();
  const from = `${Deno.env.get('RESEND_FROM_EMAIL') || DEFAULT_RESEND_FROM}`.trim() || DEFAULT_RESEND_FROM;
  const amountLabel = new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: input.currency || 'USD',
  }).format(Number(input.amount || 0));
  const subject = `Pago confirmado — CEO Rentable OS™`;

  const ctaLink = input.activationLink || `${APP_BASE_URL}/login`;
  const ctaText = input.activationLink ? 'Activar y entrar al sistema' : 'Entrar al sistema';

  const html = `
    <div style="font-family:Arial,sans-serif;background:#F7F3EE;padding:24px;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;padding:24px;border:1px solid #f0dce7;">
        <h2 style="margin:0 0 12px;color:#1f1f1f;">Pago confirmado</h2>
        <p style="margin:0 0 8px;color:#3d3d3d;">Hola <strong>${sanitizeText(input.fullName || toEmail)}</strong>,</p>
        <p style="margin:0 0 12px;color:#3d3d3d;">Recibimos tu pago de <strong>${sanitizeText(amountLabel)}</strong>. Tu acceso ya fue activado.</p>
        <p style="margin:0 0 18px;color:#3d3d3d;">Plan aplicado: <strong>${sanitizeText(input.plan || 'subscription')}</strong>.</p>
        <a href="${ctaLink}" style="display:inline-block;background:#D45387;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">${ctaText}</a>
        <p style="margin-top:20px;color:#8a7f85;font-size:12px;">CEO Rentable OS™ · Tu sistema financiero inteligente<br/>Preguntas: hola@ceorentable.com</p>
      </div>
    </div>
  `;

  let status = 'pending';
  let errorMessage = null;

  if (!resendApiKey) {
    status = 'failed';
    errorMessage = 'RESEND_API_KEY no configurada en Edge Function';
  } else {
    try {
      const response = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [toEmail],
          subject,
          html,
        }),
      });

      if (!response.ok) {
        const providerPayload = await response.json().catch(() => ({}));
        status = 'failed';
        errorMessage = sanitizeText(providerPayload?.message || providerPayload?.error || `Resend HTTP ${response.status}`);
      } else {
        status = 'sent';
      }
    } catch (error) {
      status = 'failed';
      errorMessage = sanitizeText(error instanceof Error ? error.message : `${error}`);
    }
  }

  const logPayload = {
    user_id: input.userId,
    type: 'payment_confirmation',
    to_email: toEmail,
    subject,
    status,
    content_snippet: `Pago confirmado ${amountLabel}`,
    error_message: errorMessage,
    sent_at: status === 'sent' ? nowIso() : null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  try {
    const insert = await supabase.from('email_logs').insert(logPayload);
    if (!insert.error) return;

    const missing = extractMissingColumn(insert.error);
    if (missing && Object.prototype.hasOwnProperty.call(logPayload, missing)) {
      const fallback = { ...logPayload };
      delete (fallback as Record<string, unknown>)[missing];
      await supabase.from('email_logs').insert(fallback);
    }
  } catch (_) {
    // Best-effort: nunca bloquear negocio por email/log
  }
}

async function resolveOrCreateUserFromStripeEvent(identity: ReturnType<typeof extractBuyerIdentity>) {
  const customerId = identity.customerId;
  let email = identity.emailFromMetadata || identity.emailFromInvoice || (await fetchStripeCustomerEmail(customerId));
  const metadataUserId = identity.userIdFromMetadata;

  let user =
    (await findUserByStripeCustomerId(customerId)) ||
    (await findUserById(metadataUserId)) ||
    (await findUserByEmail(email));

  let createdNow = false;
  if (!user) {
    if (!email) {
      throw new Error('No fue posible resolver email de la compradora para autoprovisionamiento');
    }

    const authUserId = await createAuthUserForStripeBuyer(email, identity.fullName);
    user = await upsertPublicUserForStripeBuyer({
      userId: authUserId,
      email,
      fullName: identity.fullName,
      customerId,
    });
    createdNow = true;
  }

  email = normalizeEmail(user?.email) || email;
  if (!user?.id) {
    throw new Error('No fue posible resolver ID de usuaria para procesar el pago');
  }

  await ensureStripeCustomerMapping(user.id, customerId);

  const mergedUser = {
    ...user,
    email: email || user.email || null,
    stripe_customer_id: customerId || user.stripe_customer_id || null,
  };

  return {
    user: mergedUser,
    createdNow,
    email,
    activationLink: createdNow
      ? await createOrRefreshActivationInvitation({
          email: email || '',
          fullName: identity.fullName,
          plan: identity.planCode || 'subscription',
        })
      : null,
  };
}

async function handlePaymentSucceeded(event: any): Promise<HandlerResult> {
  const identity = extractBuyerIdentity(event);
  console.log(`💳 Payment succeeded for customer ${identity.customerId}`);

  try {
    const { user, activationLink } = await resolveOrCreateUserFromStripeEvent(identity);

    await upsertSubscriptionForUser({
      userId: user.id,
      customerId: identity.customerId,
      subscriptionId: identity.subscriptionId,
      planCode: identity.planCode || 'subscription',
      periodStartIso: identity.periodStartIso,
      periodEndIso: identity.periodEndIso,
    });

    await insertTransactionIdempotent({
      userId: user.id,
      stripeEventId: identity.eventId,
      stripePaymentId: identity.paymentIntentId || identity.invoiceId,
      stripeInvoiceId: identity.invoiceId,
      amount: identity.amountPaid,
      currency: identity.currency,
      description: `Pago suscripción ${identity.planCode || 'subscription'}`,
    });

    const accessPayload = {
      has_access: true,
      plan: user.role === 'admin' ? user.plan : 'subscription',
      updated_at: nowIso(),
    };

    let { error: accessError } = await supabase.from('users').update(accessPayload).eq('id', user.id);
    if (accessError && isMissingColumnError(accessError, 'plan')) {
      const { plan: _ignoredPlan, ...fallbackPayload } = accessPayload;
      ({ error: accessError } = await supabase.from('users').update(fallbackPayload).eq('id', user.id));
    }

    if (accessError) {
      console.error('❌ Failed to update access:', accessError);
      return {
        ok: false,
        userId: user.id,
        errorCode: 'USER_ACCESS_UPDATE_FAILED',
        errorMessage: accessError.message || 'Failed to update user access',
      };
    }

    await sendPostPaymentEmailBestEffort({
      userId: user.id,
      email: user.email,
      fullName: user.full_name || user.business_name || null,
      amount: identity.amountPaid,
      currency: identity.currency,
      plan: identity.planCode || 'subscription',
      activationLink,
    });

    console.log(`✅ Payment processed for ${user.email} — Access activated`);
    return { ok: true, userId: user.id };
  } catch (error) {
    console.error('❌ Error in handlePaymentSucceeded:', error);
    return {
      ok: false,
      errorCode: 'PAYMENT_SUCCEEDED_HANDLER_ERROR',
      errorMessage: error instanceof Error ? error.message : `${error}`,
    };
  }
}

async function handlePaymentFailed(event: any): Promise<HandlerResult> {
  const invoice = event.data.object;
  const customerId = invoice.customer;

  console.log(`❌ Payment failed for customer ${customerId}`);

  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('stripe_customer_id', customerId)
      .single();

    if (userError || !user) {
      return {
        ok: false,
        errorCode: 'USER_NOT_FOUND',
        errorMessage: 'User not found for payment_failed',
      };
    }

    await supabase
      .from('subscriptions')
      .update({
        status: 'past_due',
        updated_at: nowIso(),
      })
      .eq('user_id', user.id);

    await supabase.from('email_logs').insert({
      user_id: user.id,
      type: 'payment_failed',
      to_email: user.email,
      subject: `⚠️ Pago rechazado — Acción requerida`,
      status: 'pending',
      content_snippet: `El pago de tu suscripción fue rechazado. Por favor actualiza tu método de pago.`,
      created_at: nowIso(),
    });

    console.log(`⚠️ Payment failed processed for ${user.email}`);
    return { ok: true, userId: user.id };
  } catch (error) {
    console.error('❌ Error in handlePaymentFailed:', error);
    return {
      ok: false,
      errorCode: 'PAYMENT_FAILED_HANDLER_ERROR',
      errorMessage: error instanceof Error ? error.message : `${error}`,
    };
  }
}

async function handleSubscriptionDeleted(event: any): Promise<HandlerResult> {
  const subscription = event.data.object;
  const customerId = subscription.customer;

  console.log(`🗑️ Subscription deleted for customer ${customerId}`);

  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, business_name')
      .eq('stripe_customer_id', customerId)
      .single();

    if (userError || !user) {
      return {
        ok: false,
        errorCode: 'USER_NOT_FOUND',
        errorMessage: 'User not found for subscription_deleted',
      };
    }

    await supabase
      .from('subscriptions')
      .update({
        status: 'canceled',
        updated_at: nowIso(),
      })
      .eq('user_id', user.id);

    await supabase
      .from('users')
      .update({
        has_access: false,
        updated_at: nowIso(),
      })
      .eq('id', user.id);

    await supabase.from('email_logs').insert({
      user_id: user.id,
      type: 'subscription_canceled',
      to_email: user.email,
      subject: `Suscripción cancelada — Te echamos de menos`,
      status: 'pending',
      content_snippet: `Tu suscripción a CEO Rentable OS™ ha sido cancelada.`,
      created_at: nowIso(),
    });

    console.log(`✅ Subscription canceled for ${user.email} — Access revoked`);
    return { ok: true, userId: user.id };
  } catch (error) {
    console.error('❌ Error in handleSubscriptionDeleted:', error);
    return {
      ok: false,
      errorCode: 'SUBSCRIPTION_DELETED_HANDLER_ERROR',
      errorMessage: error instanceof Error ? error.message : `${error}`,
    };
  }
}

async function handleChargeRefunded(event: any): Promise<HandlerResult> {
  const charge = event.data.object;
  const customerId = charge.customer;

  console.log(`💰 Refund processed for customer ${customerId}`);

  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('stripe_customer_id', customerId)
      .single();

    if (userError || !user) {
      return {
        ok: false,
        errorCode: 'USER_NOT_FOUND',
        errorMessage: 'User not found for charge_refunded',
      };
    }

    await supabase.from('transactions').insert({
      user_id: user.id,
      amount: -Math.abs(charge.amount_refunded / 100),
      currency: charge.currency?.toUpperCase() || 'USD',
      type: 'refund',
      status: 'completed',
      stripe_payment_id: charge.id,
      created_at: nowIso(),
    });

    await supabase.from('email_logs').insert({
      user_id: user.id,
      type: 'refund_processed',
      to_email: user.email,
      subject: `Reembolso procesado — RD$${(Math.abs(charge.amount_refunded) / 100).toFixed(2)}`,
      status: 'pending',
      content_snippet: `Tu reembolso de RD$${(Math.abs(charge.amount_refunded) / 100).toFixed(2)} ha sido procesado.`,
      created_at: nowIso(),
    });

    console.log(`✅ Refund processed for ${user.email}`);
    return { ok: true, userId: user.id };
  } catch (error) {
    console.error('❌ Error in handleChargeRefunded:', error);
    return {
      ok: false,
      errorCode: 'CHARGE_REFUNDED_HANDLER_ERROR',
      errorMessage: error instanceof Error ? error.message : `${error}`,
    };
  }
}

Deno.serve(async (req) => {
  const requestId = resolveRequestId(req);
  const flowStartedAt = Date.now();

  observeLog('stripe.webhook.received', {
    request_id: requestId,
    method: req.method,
  });

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  if (!signature) {
    observeLog(
      'stripe.webhook.signature_invalid',
      {
        request_id: requestId,
        error_message: 'Missing stripe-signature header',
      },
      'warn'
    );
    console.error('❌ Missing stripe-signature header');
    return new Response(JSON.stringify({ error: 'Missing signature' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { verified, event } = await verifyStripeSignature(body, signature);

  if (!verified || !event) {
    observeLog(
      'stripe.webhook.signature_invalid',
      {
        request_id: requestId,
        error_message: 'Invalid signature',
      },
      'warn'
    );
    console.error('❌ Invalid Stripe signature');
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const observationMeta = await safeObserveReceived(event, requestId);

  observeLog('stripe.webhook.signature_valid', {
    request_id: requestId,
    stripe_event_id: event.id,
    event_type: event.type,
    livemode: Boolean(event.livemode),
    is_replay: observationMeta?.isReplay === true,
    attempt_count: observationMeta?.attemptCount ?? 1,
  });

  await safeObserveStatus(
    event.id,
    {
      status: 'processing',
      processing_started_at: nowIso(),
      request_id: requestId,
    },
    requestId
  );

  observeLog('stripe.webhook.processing_started', {
    request_id: requestId,
    stripe_event_id: event.id,
    event_type: event.type,
  });

  console.log(`📨 Processing Stripe event: ${event.type}`);

  try {
    let finalStatus: 'processed' | 'failed' | 'ignored' = 'processed';
    let handlerResult: HandlerResult | null = null;

    switch (event.type) {
      case 'invoice.payment_succeeded':
        handlerResult = await handlePaymentSucceeded(event);
        break;

      case 'invoice.payment_failed':
        handlerResult = await handlePaymentFailed(event);
        break;

      case 'customer.subscription.deleted':
        handlerResult = await handleSubscriptionDeleted(event);
        break;

      case 'charge.refunded':
        handlerResult = await handleChargeRefunded(event);
        break;

      default:
        finalStatus = 'ignored';
        console.log(`⚠️ Unhandled event type: ${event.type}`);
    }

    if (finalStatus !== 'ignored' && handlerResult && !handlerResult.ok) {
      finalStatus = 'failed';
    }

    const finishedAt = nowIso();
    const finalPatch: Record<string, unknown> = {
      status: finalStatus,
      processed_at: finishedAt,
      request_id: requestId,
      last_http_status: 200,
      user_id: handlerResult?.userId ?? null,
      error_code: finalStatus === 'failed' ? handlerResult?.errorCode || 'WEBHOOK_HANDLER_FAILED' : null,
      error_message_sanitized:
        finalStatus === 'failed'
          ? sanitizeText(handlerResult?.errorMessage || 'Webhook handler reported a failure')
          : null,
      last_error_at: finalStatus === 'failed' ? finishedAt : null,
    };

    await safeObserveStatus(event.id, finalPatch, requestId);

    if (finalStatus === 'failed') {
      observeLog(
        'stripe.webhook.processing_error',
        {
          request_id: requestId,
          stripe_event_id: event.id,
          event_type: event.type,
          error_code: handlerResult?.errorCode || 'WEBHOOK_HANDLER_FAILED',
          error_message: sanitizeText(handlerResult?.errorMessage || 'Webhook handler reported a failure'),
          duration_ms: Date.now() - flowStartedAt,
        },
        'warn'
      );
    } else {
      observeLog('stripe.webhook.processing_finished', {
        request_id: requestId,
        stripe_event_id: event.id,
        event_type: event.type,
        status: finalStatus,
        duration_ms: Date.now() - flowStartedAt,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        event_type: event.type,
        event_id: event.id,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    const errorMessage = sanitizeText(error instanceof Error ? error.message : `${error}`);

    await safeObserveStatus(
      event?.id || null,
      {
        status: 'failed',
        request_id: requestId,
        processed_at: nowIso(),
        last_error_at: nowIso(),
        last_http_status: 500,
        error_code: 'WEBHOOK_PROCESSING_EXCEPTION',
        error_message_sanitized: errorMessage,
      },
      requestId
    );

    observeLog(
      'stripe.webhook.processing_error',
      {
        request_id: requestId,
        stripe_event_id: event?.id || null,
        event_type: event?.type || null,
        error_code: 'WEBHOOK_PROCESSING_EXCEPTION',
        error_message: errorMessage,
        duration_ms: Date.now() - flowStartedAt,
      },
      'error'
    );

    console.error('❌ Error processing webhook:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});
