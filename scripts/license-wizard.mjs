#!/usr/bin/env node
// Simple license wizard for the seller.
// Terminal text is written in Finglish (Latin letters) on purpose: Windows cmd
// and some Linux terminals break right-to-left Persian text, so every line this
// script prints stays ASCII-safe. Persian term: ویزارد سادهٔ لایسنس (fingilish).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import {
  signLicense,
  verifyLicense,
  EDITION_PRESETS,
  BASE_MODULES,
  VENDOR,
} from '../shared/license.js';
import { moduleDefs, featureDefs } from '../shared/catalog.js';

const KEYS_DIR = 'license-keys';
const PRIVATE_FILE = path.join(KEYS_DIR, 'license-private.pem');
const PUBLIC_FILE = path.join(KEYS_DIR, 'license-public.pem');
const CAPS = (id) => featureDefs.filter((f) => f.module === id).length;
const MODULES = moduleDefs.map((m) => ({ ...m, caps: CAPS(m.id) }));
const EDITIONS = [
  { key: '1', id: 'base', title: 'Base (12 core modules only)' },
  { key: '2', id: 'standard', title: 'Standard (base + finance + library + reports)' },
  { key: '3', id: 'complete', title: 'Complete (all 17 modules)' },
  { key: '4', id: 'custom', title: 'Custom (choose modules by number)' },
];
const YES = ['bale', 'yes', 'y', 'b', 'are', 'areh', 'baleh'];

// Interactive when a real terminal is attached; otherwise answers are read
// line by line from stdin so the wizard can be tested automatically.
const interactive = !!process.stdin.isTTY;
const pipedAnswers = interactive ? [] : fs.readFileSync(0, 'utf8').split('\n');
let pipedIndex = 0;
const rl = interactive
  ? readline.createInterface({ input: process.stdin, output: process.stdout })
  : { close: () => {} };

const ask = async (question, fallback = '') => {
  if (!interactive) {
    const answer = (pipedAnswers[pipedIndex++] ?? '').trim();
    console.log(`${question}${answer || `(empty -> ${fallback || 'none'})`}`);
    return answer || fallback;
  }
  const answer = (await rl.question(question)).trim();
  return answer || fallback;
};

const askYes = async (question) => {
  const raw = await ask(`${question} (bale / kheyr) `);
  return YES.includes(String(raw).toLowerCase());
};

function makeKeys() {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(PRIVATE_FILE, privateKey.export({ type: 'pkcs8', format: 'pem' }), {
    mode: 0o600,
  });
  fs.writeFileSync(PUBLIC_FILE, publicKey.export({ type: 'spki', format: 'pem' }));
}

// نام لاتین برای ترمینال؛ متن فارسی همان name است که در رابط کاربری دیده می‌شود.
const moduleTitle = (id) => MODULES.find((m) => m.id === id)?.name_latin || id;
const additionModules = () => MODULES.filter((m) => !BASE_MODULES.includes(m.id));

function printModuleMenu() {
  console.log('\nAdd-on modules (base modules are always included):\n');
  additionModules().forEach((m, index) => {
    console.log(`  ${index + 1}) ${m.id.padEnd(14)} ${m.name_latin}  -  ${m.caps} capabilities`);
  });
  console.log('');
}

async function main() {
  console.log('\n====================================================');
  console.log(`  ${VENDOR.product_latin} LICENSE WIZARD  -  ${VENDOR.name_latin} (${VENDOR.url})`);
  console.log('====================================================\n');

  if (!fs.existsSync(PRIVATE_FILE)) {
    console.log('First run: creating your vendor key pair now.');
    console.log('The private key is your signature; it proves a license came from you.\n');
    makeKeys();
    console.log(`OK  private key: ${PRIVATE_FILE}   <-- keep this ONLY for yourself.`);
    console.log(`OK  public key : ${PUBLIC_FILE}\n`);
    console.log('Never send the private key to anyone and never publish it.');
    console.log('Before packing the sale build, run:  npm run package:cpanel');
    console.log('That command puts your public key inside the package automatically.\n');
  }

  const school = await ask('1) School name (printed on the license): ');
  if (!school) {
    console.log('School name is required. Run the wizard again.');
    rl.close();
    process.exit(1);
  }
  const year = new Date().toLocaleDateString('fa-IR-u-nu-latn', { year: 'numeric' }).slice(0, 4);
  const serial = await ask(
    '2) Serial number (press Enter to auto-generate): ',
    `MY-${year}-${crypto.randomInt(1000, 9999)}`,
  );

  console.log('\n3) Which edition did the customer buy?');
  for (const edition of EDITIONS) console.log(`   ${edition.key}) ${edition.title}`);
  const choice = await ask('   Enter 1-4: ', '2');

  let modules = [];
  const selected = EDITIONS.find((edition) => edition.key === choice) || EDITIONS[1];
  if (selected.id === 'custom') {
    printModuleMenu();
    const picked = await ask('   Module numbers separated by comma (example 1,3): ');
    modules = picked
      .split(',')
      .map((item) => additionModules()[Number(item.trim()) - 1])
      .filter(Boolean)
      .map((m) => m.id);
    if (!modules.length) {
      console.log('Nothing was selected; the base edition is used instead.');
      modules = [...EDITION_PRESETS.base.modules];
    }
  } else {
    modules = [...EDITION_PRESETS[selected.id].modules];
  }

  const note = await ask('4) Contract note (optional, example: central branch): ');
  const lifetime = await askYes('5) Lifetime license (no expiry)?');
  const expires = lifetime ? '' : await ask('   Expiry date (example 2028-06-30), empty = none: ');

  const payload = {
    v: '1.1.1',
    id: serial,
    customer: school,
    school,
    edition: selected.id,
    modules,
    features: [],
    issued: new Date().toISOString().slice(0, 10),
    expires,
    note,
    issuer: VENDOR.name,
    issuer_latin: VENDOR.name_latin,
    issuer_url: VENDOR.url,
  };
  const doc = signLicense(payload, fs.readFileSync(PRIVATE_FILE, 'utf8'));
  const out = path.join(KEYS_DIR, `${serial}.json`);
  fs.writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
  const check = verifyLicense(doc, fs.readFileSync(PUBLIC_FILE, 'utf8'));

  const extras = modules.filter((id) => !BASE_MODULES.includes(id));
  console.log('\n====================================================');
  console.log('  LICENSE CREATED');
  console.log('====================================================');
  console.log(`   license file : ${out}`);
  console.log(`   school       : ${school}`);
  console.log(`   serial       : ${serial}`);
  console.log(`   edition      : ${selected.id}  (${modules.length} modules)`);
  console.log(`   add-ons      : ${extras.length ? extras.map(moduleTitle).join(', ') : 'none'}`);
  console.log(`   expiry       : ${expires || 'lifetime'}`);
  console.log(`   issuer       : ${VENDOR.name_latin} - ${VENDOR.url}`);
  console.log(
    `   signature    : ${check.valid ? 'verified OK' : 'PROBLEM, do not send this file'}`,
  );
  console.log('\n----------------------------------------------------');
  console.log('What to send to the school (copy this message):');
  console.log('----------------------------------------------------');
  console.log(`Hello. The file "${serial}.json" is the license of "${school}".`);
  console.log('To activate it, three simple steps:');
  console.log(
    '  1) Put this file in the DATA folder of the system and rename it exactly: license.json',
  );
  console.log('  2) Add one line to the .env file:  LICENSE_MODE=on');
  console.log('  3) Restart the app from the cPanel Node.js panel.');
  console.log('After the restart, open Settings -> Service status: you should see the school name');
  console.log('and the number of licensed modules. Modules the school did not buy show a');
  console.log('"for purchase" badge on the Modules page.');
  console.log(`Support and sales: ${VENDOR.name_latin} - ${VENDOR.url}`);
  console.log('\nSeller reminder: before sending the sale package, run:  npm run package:cpanel');
  console.log('That embeds your public key in the package so the school needs no extra setup.');
  console.log('Never send your private key. Keep the license-keys folder backed up.\n');
  console.log('Persian version of the handover steps: docs/LICENSE-SIMPLE.md (section 3).\n');
  rl.close();
}

main().catch((error) => {
  console.error('\nERROR:', error.message);
  rl.close();
  process.exit(1);
});
