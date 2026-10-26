import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  captureDiagnostic,
  diagnosticCaptureSchema,
} from "../server/commercialJourney.js";
import { runCommercialDeliveryBatch } from "../server/commercialDelivery.js";
import { handlePayPalSubscriptionWebhookPayload } from "../server/paypalSubscriptionWebhookHandler.js";
import { maySendTrialStep } from "../server/trialSequenceTemplates.js";
const answers = {
  business_type: "servicios",
  monthly_sales: "under_30k",
  client_volume: "under_10",
  knows_margin: false,
  controls_costs: false,
  knows_best_product: false,
  management_method: "cuaderno",
  main_problem: "rentabilidad",
};
export const fixtureCapture = {
  capture_id: "10000000-0000-4000-8000-000000000001",
  name: "Prueba aislada",
  email: "fixture@example.invalid",
  answers,
  attribution: {
    utm_source: "facebook",
    utm_medium: "paid_social",
    utm_campaign: "fixture-campaign",
    advertising_consent: false,
    fbclid: "discard-me",
  },
  email_requested: true,
  promotional_consent: false,
  is_test: true,
};
test("Validación, consentimiento y un diagnóstico calculado sin inventar ingresos", async () => {
  const parsed = diagnosticCaptureSchema.parse(fixtureCapture);
  assert.equal(parsed.attribution.fbclid, undefined);
  assert.equal(
    diagnosticCaptureSchema.safeParse({
      ...fixtureCapture,
      email_requested: false,
    }).success,
    false,
  );
  const result = await captureDiagnostic(fixtureCapture, { client: null });
  assert.equal(result.status, 503);
});
test("Captura, cola persistente, reintentos, RLS, pruebas y bajas", async (t) => {
  const db = new PGlite();
  const user = randomUUID();
  let lead;
  const client = {
    rpc: async (name, args = {}) => {
      try {
        const r = await db.query(
          `select public.${name}(${Object.keys(args)
            .map((k, i) => `${k}=>$${i + 1}`)
            .join(",")}) result`,
          Object.values(args),
        );
        return { data: r.rows[0].result, error: null };
      } catch (error) {
        return { data: null, error: { code: error.code } };
      }
    },
  };
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now());create table public.leads(id uuid primary key default gen_random_uuid(),name text not null,email text not null,source text,status text,ceo_score numeric,monthly_sales text,knows_margin boolean,controls_costs boolean,knows_best_product boolean,created_at timestamptz default now(),updated_at timestamptz default now());grant usage on schema public,auth to anon,authenticated,service_role;grant all on public.leads to service_role;grant insert on public.leads to anon,authenticated;",
    );
    await db.exec(
      await readFile(
        "supabase/migrations/202610260001_commercial_journey.sql",
        "utf8",
      ),
    );
    const env = {
      COMMERCIAL_JOURNEY_ENABLED: "true",
      COMMERCIAL_DELIVERY_ENABLED: "true",
      VERCEL_ENV: "production",
      AI_OS_CRM_WEBHOOK_SECRET:
        "test-only-transport-secret-with-thirty-two-characters",
      DIAGNOSTIC_EMAIL_ENABLED: "true",
    };
    await t.test(
      "Guarda respuestas y resultado con la cola de CRM/email en una transacción",
      async () => {
        const saved = await captureDiagnostic(fixtureCapture, {
          client,
          env,
          ip: "isolated",
        });
        assert.equal(saved.status, 200);
        assert.equal(saved.body.diagnostic.score, 5);
        lead = (await db.query("select * from leads")).rows[0];
        assert.equal(lead.is_test, true);
        assert.equal(lead.attribution.fbclid, undefined);
        assert.equal(
          (await db.query("select * from ceo_commercial_events")).rows.length,
          1,
        );
        assert.equal(
          (await db.query("select * from ceo_commercial_deliveries")).rows
            .length,
          2,
        );
        const retry = await captureDiagnostic(fixtureCapture, {
          client,
          env,
          ip: "isolated",
        });
        assert.equal(retry.status, 200);
        assert.equal((await db.query("select * from leads")).rows.length, 1);
        assert.equal(
          (
            await captureDiagnostic(
              { ...fixtureCapture, email: "different@example.invalid" },
              { client, env, ip: "isolated" },
            )
          ).status,
          503,
        );
      },
    );
    await t.test(
      "No se pueden fabricar hechos ni atribución desde roles del navegador",
      async () => {
        await db.exec("set role anon");
        await assert.rejects(() =>
          db.query(
            "insert into leads(name,email,capture_id) values('X','x@example.invalid',gen_random_uuid())",
          ),
        );
        await assert.rejects(() =>
          db.query("select * from ceo_commercial_events"),
        );
        await assert.rejects(() =>
          db.query("select ceo_claim_delivery('crm')"),
        );
        await db.exec("reset role");
      },
    );
    await t.test(
      "CRM valida acknowledgement; fallos conservan payload y pruebas nunca envían correo",
      async () => {
        let firstBody;
        let sends = 0;
        const outbound = [];
        let result = await runCommercialDeliveryBatch({
          client,
          env,
          fetchImpl: async (_url, init) => {
            firstBody = init.body;
            outbound.push(JSON.parse(init.body));
            return Response.json({ error: "rejected" }, { status: 503 });
          },
          sendEmail: async () => {
            sends++;
            throw new Error("Unexpected email");
          },
        });
        assert.equal(sends, 0);
        assert.equal(result.failed, 1);
        assert.equal(
          outbound[0].capture_source_key,
          "ceo-rentable-diagnostico",
        );
        assert.equal(outbound[0].is_test, true);
        await db.query(
          "update ceo_commercial_deliveries set available_at=now()-interval '1 minute' where destination='crm'",
        );
        result = await runCommercialDeliveryBatch({
          client,
          env,
          fetchImpl: async (_url, init) => {
            assert.equal(init.body, firstBody);
            assert.ok(init.headers["X-CRM-Signature"].startsWith("sha256="));
            return Response.json({ lead_id: randomUUID() });
          },
        });
        assert.equal(result.delivered, 1);
        const again = await runCommercialDeliveryBatch({
          client,
          env,
          fetchImpl: async () => {
            throw new Error("No duplicate");
          },
        });
        assert.equal(again.delivered, 0);
        assert.equal(
          (
            await db.query(
              "select * from ceo_commercial_deliveries where destination='diagnostic_email'",
            )
          ).rows[0].status,
          "skipped",
        );
      },
    );
    await t.test(
      "Vinculación exige email confirmado; la prueba se registra y el pago cancela acompañamiento",
      async () => {
        await db.query(
          "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
          [user, fixtureCapture.email],
        );
        await assert.rejects(() =>
          db.query("select ceo_link_diagnostic_user($1,$2,$3)", [
            fixtureCapture.capture_id,
            user,
            "other@example.invalid",
          ]),
        );
        await db.query("select ceo_link_diagnostic_user($1,$2,$3)", [
          fixtureCapture.capture_id,
          user,
          fixtureCapture.email,
        ]);
        const at = new Date().toISOString(),
          end = new Date(Date.now() + 10 * 86400000).toISOString();
        await db.query(
          "select ceo_record_commercial_event($1,'trial:test','trial.started',$2,$3)",
          [
            user,
            at,
            { subscription_id: "SUB-FIXTURE", ends_at: end, is_test: true },
          ],
        );
        assert.equal(
          (await db.query("select * from ceo_trial_sequence")).rows.length,
          5,
        );
        assert.equal(
          (await db.query("select * from ceo_trial_sequence where day=2"))
            .rows[0].status,
          "cancelled",
        );
        const pay = {
          provider: "paypal",
          payment_id: "CAPTURE-FIXTURE",
          amount: 17.99,
          currency: "USD",
          is_test: true,
        };
        await db.query(
          "select ceo_record_commercial_event($1,'payment:test','subscription.paid',$2,$3)",
          [user, at, pay],
        );
        await db.query(
          "select ceo_record_commercial_event($1,'payment:test','subscription.paid',now(),$2)",
          [user, pay],
        );
        assert.equal(
          (
            await db.query(
              "select * from ceo_commercial_events where event_id='payment:test'",
            )
          ).rows.length,
          1,
        );
        assert.equal(
          (
            await db.query(
              "select * from ceo_trial_sequence where status<>'cancelled'",
            )
          ).rows.length,
          0,
        );
        await db.query("select ceo_unsubscribe($1)", [lead.unsubscribe_token]);
        assert.equal(
          (await db.query("select promotional_consent from leads")).rows[0]
            .promotional_consent,
          false,
        );
      },
    );
    await t.test('Una prueba de pago sandbox no convierte un prospecto real en clienta',async()=>{
      const id=randomUUID(),account=randomUUID(),email='real-fixture@example.invalid';
      assert.equal((await captureDiagnostic({...fixtureCapture,capture_id:id,email,is_test:false},{client,env,ip:'isolated-second'})).status,200);
      await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[account,email]);
      await db.query('select ceo_link_diagnostic_user($1,$2,$3)',[id,account,email]);
      const result=await db.query("select ceo_record_commercial_event($1,'sandbox-no-real','subscription.paid',now(),$2) ok",[account,{provider:'paypal',payment_id:'SANDBOX',amount:17.99,currency:'USD',is_test:true}]);
      assert.equal(result.rows[0].ok,false);
      assert.equal((await db.query("select * from ceo_commercial_events where event_id='sandbox-no-real'")).rows.length,0);
    });
    await t.test('Límite por destinatario bloquea el cuarto diagnóstico sin crear trabajos',async()=>{
      for(let i=0;i<2;i++)assert.equal((await captureDiagnostic({...fixtureCapture,capture_id:randomUUID()},{client,env,ip:'isolated-rate'})).status,200);
      assert.equal((await captureDiagnostic({...fixtureCapture,capture_id:randomUUID()},{client,env,ip:'isolated-rate'})).status,429);
    });
    await t.test(
      "Reaplicar la migración final conserva capturas y eventos",
      async () => {
        const before = (
          await db.query("select count(*) n from ceo_commercial_events")
        ).rows[0].n;
        await db.exec(
          await readFile(
            "supabase/migrations/202610260001_commercial_journey.sql",
            "utf8",
          ),
        );
        assert.equal(
          (await db.query("select count(*) n from ceo_commercial_events"))
            .rows[0].n,
          before,
        );
      },
    );
  } finally {
    await db.close();
  }
});
test("El webhook de suscripción no registra un pago sin firma ni para una suscripción ajena", async () => {
  let calls = 0;
  const client = {
    from: () => {
      calls++;
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      };
    },
  };
  const event = {
    event_type: "PAYMENT.SALE.COMPLETED",
    resource: {
      id: "SALE",
      billing_agreement_id: "SUB",
      state: "completed",
      amount: { total: "17.99", currency: "USD" },
    },
  };
  const denied = await handlePayPalSubscriptionWebhookPayload(event, {
    serviceClient: client,
    verifySignature: async () => false,
  });
  assert.equal(denied.status, 401);
  assert.equal(calls, 0);
  const unknown = await handlePayPalSubscriptionWebhookPayload(event, {
    serviceClient: client,
    verifySignature: async () => true,
  });
  assert.equal(unknown.body.status, "unmatched_subscription_ignored");
});
test("Acompañamiento preparado se detiene con pago, baja, vencimiento o falta de consentimiento", () => {
  const input = {
    step: 2,
    consent: true,
    paid: false,
    cancelled: false,
    trialEndsAt: new Date(Date.now() + 100000).toISOString(),
  };
  assert.equal(maySendTrialStep(input), true);
  for (const change of [
    { paid: true },
    { cancelled: true },
    { consent: false },
    { trialEndsAt: "2000-01-01" },
  ])
    assert.equal(maySendTrialStep({ ...input, ...change }), false);
});

test('Cobro recurrente con firma válida registra monto real y pide retry si no puede persistir',async()=>{
 const recorded=[];let fail=false;
 const client={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{user_id:randomUUID()},error:null})})})}),rpc:async(_fn,args)=>{recorded.push(args);return {data:!fail,error:fail?{code:'DATABASE_UNAVAILABLE'}:null};}};
 const event={id:'PROVIDER-EVENT-FIXTURE',create_time:new Date().toISOString(),event_type:'PAYMENT.SALE.COMPLETED',resource:{id:'SALE-FIXTURE',billing_agreement_id:'SUB-FIXTURE',state:'completed',amount:{total:'17.99',currency:'USD'}}};
 const options={serviceClient:client,verifySignature:async()=>true,env:{COMMERCIAL_JOURNEY_ENABLED:'true',PAYPAL_ENVIRONMENT:'live'}};
 const accepted=await handlePayPalSubscriptionWebhookPayload(event,options);assert.equal(accepted.status,200);assert.equal(recorded[0].p_data.amount,17.99);assert.equal(recorded[0].p_data.currency,'USD');assert.equal(recorded[0].p_data.is_test,false);
 fail=true;const retry=await handlePayPalSubscriptionWebhookPayload(event,options);assert.equal(retry.status,503);assert.equal(retry.body.code,'COMMERCIAL_RETRY_REQUIRED');
});
