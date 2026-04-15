#!/usr/bin/env node

import { execSync } from 'node:child_process';
import process from 'node:process';

function run(command) {
  console.log(`\n$ ${command}`);
  execSync(command, { stdio: 'inherit' });
}

function out(command) {
  return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function shellQuote(value) {
  return `'${`${value}`.replace(/'/g, `'\\''`)}'`;
}

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

function usage() {
  console.log(`
Uso:
  npm run deploy:main -- "mensaje del commit"
  npm run deploy:main -- -m "mensaje del commit"
  npm run deploy:main:fast -- "mensaje del commit"   (sin lint/build)
  `);
}

const args = process.argv.slice(2);
const skipCheck = args.includes('--skip-check');
const messageFlagIndex = Math.max(args.indexOf('-m'), args.indexOf('--message'));

let message = '';
if (messageFlagIndex >= 0) {
  message = `${args[messageFlagIndex + 1] || ''}`.trim();
} else {
  message = args.filter((arg) => !arg.startsWith('--')).join(' ').trim();
}

if (!message) {
  usage();
  fail('Debes indicar el mensaje del commit.');
}

try {
  const insideGit = out('git rev-parse --is-inside-work-tree');
  if (insideGit !== 'true') {
    fail('Este directorio no es un repositorio Git.');
  }
} catch (_) {
  fail('No se pudo validar el repositorio Git.');
}

let originUrl = '';
try {
  originUrl = out('git remote get-url origin');
} catch (_) {
  fail('No existe remote "origin". Configúralo antes de hacer deploy.');
}

const branch = out('git branch --show-current');
if (branch !== 'main') {
  fail(`Estás en la rama "${branch}". Cambia a "main" para usar este flujo.`);
}

const hasChanges = !!out('git status --porcelain');
if (!hasChanges) {
  fail('No hay cambios locales para commitear.');
}

if (!skipCheck) {
  run('npm run deploy:check');
} else {
  console.log('\n⚠️ Saltando validación (lint/build) por --skip-check');
}

run('git add -A');

const stagedFiles = out('git diff --cached --name-only');
if (!stagedFiles) {
  fail('No hay cambios en staging (git add).');
}

run(`git commit -m ${shellQuote(message)}`);
run('git push origin main');

console.log('\n✅ Listo. Cambios subidos a GitHub.');
console.log(`📦 Remote: ${originUrl}`);
console.log('🚀 Vercel debería iniciar deploy automático de main en unos segundos.');
