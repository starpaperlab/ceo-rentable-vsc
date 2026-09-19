import test from 'node:test';
import assert from 'node:assert/strict';
import { INDUSTRIES, INDUSTRY_TEMPLATES, mergedIndustryTemplate, setupCompletion } from '../src/config/industryTemplates.js';

test('every initial industry except custom other has an adaptive template',()=>{
 const codes=[...INDUSTRIES.products,...INDUSTRIES.services].map(([id])=>id).filter(id=>id!=='other');
 for(const code of new Set(codes)) assert.ok(INDUSTRY_TEMPLATES[code],`Missing industry template: ${code}`);
});

test('merged templates de-duplicate suggestions for mixed businesses',()=>{
 const merged=mergedIndustryTemplate(['creative_stationery','digital_services']);
 assert.equal(merged.expenses.length,new Set(merged.expenses).size);
 assert.equal(merged.materials.length,new Set(merged.materials).size);
 assert.equal(merged.equipment.length,new Set(merged.equipment).size);
 assert.equal(merged.subscriptions.length,new Set(merged.subscriptions).size);
 assert.ok(merged.materials.includes('Papel'));
 assert.ok(merged.subscriptions.includes('ChatGPT'));
});

test('configuration completion has a defined 100 point ceiling',()=>{
 const config={business_model:'products',industry_codes:['bakery'],workplace_modes:['home'],work_days_per_week:5,work_hours_per_day:8,monthly_capacity:20,monthly_capacity_unknown:false,operation_mode:'made_to_order',labor_mode:'solo',personal_income_goal:50000};
 assert.equal(setupCompletion(config,{expenses:1,materials:1,equipment:1}),100);
});

test('service businesses are not penalized for having no materials',()=>{
 const config={business_model:'services',industry_codes:['consulting'],workplace_modes:['online'],work_days_per_week:5,work_hours_per_day:6,monthly_capacity_unknown:true,monthly_capacity:null,operation_mode:'project',labor_mode:'solo',personal_income_goal:70000};
 assert.equal(setupCompletion(config,{expenses:1,materials:0,equipment:1}),100);
});
