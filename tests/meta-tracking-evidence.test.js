import test from 'node:test';
import assert from 'node:assert/strict';
import { trialTrackingEvidence } from '../server/metaTrackingEvidence.js';
const context={subscriptionId:'I-UNIT-TEST',planCode:'monthly',appStatus:'trialing'};
const active={status:'ACTIVE',billing_info:{cycle_executions:[{tenure_type:'TRIAL',cycles_completed:0,cycles_remaining:1,total_cycles:1},{tenure_type:'REGULAR',cycles_completed:0}],last_payment:{amount:{value:'0.00'}}}};
test('StartTrial requiere prueba vigente y activación real confirmada por proveedor',()=>{
 const result=trialTrackingEvidence(active,context);
 assert.equal(result.trialActivated,true);assert.equal(result.eventId,'StartTrial:paypal:I-UNIT-TEST');
 assert.deepEqual(trialTrackingEvidence(active,context),result);
});
test('Aprobación, acceso genérico, ciclos ausentes o pagos regulares no equivalen a prueba activada',()=>{
 const cases=[{...active,status:'APPROVED'},{...active,status:'APPROVAL_PENDING'},{...active,status:'CANCELLED'},{status:'ACTIVE'},{...active,billing_info:{...active.billing_info,last_payment:{amount:{value:'17.99'}}}},{...active,billing_info:{cycle_executions:[{tenure_type:'TRIAL',cycles_remaining:0,total_cycles:1,cycles_completed:1}]}},{...active,billing_info:{cycle_executions:[{tenure_type:'TRIAL',cycles_remaining:1},{tenure_type:'REGULAR',cycles_completed:1}]}}];
 for(const value of cases){const result=trialTrackingEvidence(value,context);assert.equal(result.trialActivated,false);assert.equal(result.eventId,undefined);}
 assert.equal(trialTrackingEvidence(active,{...context,appStatus:'active'}).trialActivated,false);
});
