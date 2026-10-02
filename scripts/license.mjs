#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import {
  ALL_MODULES,
  BASE_MODULES,
  EDITION_PRESETS,
  capabilityCount,
  moduleLabel,
  signLicense,
  verifyLicense,
  stableSerialize,
  VENDOR,
} from '../shared/license.js';
import { moduleDefs } from '../shared/catalog.js';

const HELP = `
${VENDOR.product_latin} license tool - modular sales (lifetime, no subscription)
${VENDOR.name_latin} - ${VENDOR.url}

  node scripts/license.mjs list
      Module list, capability count of each module and ready-made editions.

  node scripts/license.mjs keygen [--out ./license-keys]
      One-time vendor key pair. Keep the private key secret and outside git;
      the public key ships inside the sale build (LICENSE_PUBLIC_KEY or the
      VENDOR_PUBLIC_KEY constant in shared/license.js).

  node scripts/license.mjs issue --customer "School name" [options]
        --customer "School name"          (required)
        --school   "Display name"
        --edition  base|standard|complete|custom     (default custom)
        --modules  finance,library,meetings
        --features exports.xlsx,settings.messaging   single capabilities
        --id       MY-1405-0042           serial (default: automatic)
        --note     "central branch"
        --expires  2027-06-30             default: lifetime
        --key      ./license-keys/license-private.pem
        --out      ./license-keys/school.json
        --quiet                           print only the output path

  node scripts/license.mjs inspect --license ./license-keys/school.json [--key PUBLIC.pem]
      Check a license without the private key.

  Tip: for everyday use, run the simple wizard instead:  npm run license:make
`;

const MODULES = moduleDefs.map((m) => m.id);

const fail = (message) => {
  console.error(`ERROR: ${message}`);
  process.exit(1);
};

const splitList = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

function printCatalog() {
  console.log(
    `\n${VENDOR.product_latin} - sellable modules  (${VENDOR.name_latin} - ${VENDOR.url})\n`,
  );
  for (const id of MODULES) {
    const mark = BASE_MODULES.includes(id) ? '  [base]' : '';
    console.log(
      `  ${id.padEnd(16)} ${String(capabilityCount(id)).padStart(3)} capabilities${mark}`,
    );
  }
  console.log('\nReady-made editions:');
  for (const [key, preset] of Object.entries(EDITION_PRESETS))
    console.log(
      `  ${key.padEnd(10)} ${String(preset.modules.length).padStart(2)} modules: ${preset.modules.join(', ')}`,
    );
  console.log('\nTypical sale: base modules + chosen add-ons, one serial per school.\n');
}

function keygen(options) {
  const dir = path.resolve(options.out || 'license-keys');
  fs.mkdirSync(dir, { recursive: true });
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const privateFile = path.join(dir, 'license-private.pem');
  const publicFile = path.join(dir, 'license-public.pem');
  fs.writeFileSync(privateFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), {
    mode: 0o600,
  });
  fs.writeFileSync(publicFile, publicKey.export({ type: 'spki', format: 'pem' }));
  console.log(`OK  private key: ${privateFile}   <-- never share it and never commit it.`);
  console.log(`OK  public key : ${publicFile}`);
  console.log('\nShip the public key with the sale build, pick one:');
  console.log('  1) put it in the .env of the host (single line with \\n):');
  console.log(`     LICENSE_MODE=on`);
  console.log(
    `     LICENSE_PUBLIC_KEY="${fs.readFileSync(publicFile, 'utf8').replace(/\n/g, '\\n').trim()}"`,
  );
  console.log('  2) or simply run:  npm run package:cpanel   (embeds the key automatically).');
  console.log(
    `\nThen issue a license per customer:\n  node scripts/license.mjs issue --customer "School name" --edition standard --key ${privateFile}`,
  );
}

function issue(options) {
  const customer = String(options.customer || '').trim();
  if (!customer) fail('customer name is required: --customer "School name"');
  const keyFile = path.resolve(options.key || 'license-keys/license-private.pem');
  if (!fs.existsSync(keyFile))
    fail(`private key not found: ${keyFile} (run: npm run license:keygen)`);
  const edition = String(options.edition || 'custom').toLowerCase();
  let modules = splitList(options.modules);
  if (!modules.length && EDITION_PRESETS[edition]) modules = [...EDITION_PRESETS[edition].modules];
  if (edition !== 'custom' && EDITION_PRESETS[edition] && splitList(options.modules).length)
    modules = Array.from(new Set([...EDITION_PRESETS[edition].modules, ...modules]));
  if (!modules.length)
    fail('module list is empty: use --modules finance,library or --edition standard');
  // ماژول‌های پایه در قرارداد همهٔ مشتریان هست؛ فایل لایسنس هم همان‌ها را فهرست می‌کند.
  modules = Array.from(new Set([...BASE_MODULES, ...modules]));
  const unknown = modules.filter((id) => !MODULES.includes(id));
  if (unknown.length) fail(`unknown module: ${unknown.join(', ')}`);
  const features = splitList(options.features);
  const year = new Date().toLocaleDateString('fa-IR-u-nu-latn', { year: 'numeric' }).slice(0, 4);
  const payload = {
    v: '1.2.1',
    id: String(options.id || `MY-${year}-${crypto.randomInt(1000, 9999)}`).trim(),
    customer,
    school: String(options.school || customer).trim(),
    edition: EDITION_PRESETS[edition] ? edition : 'custom',
    modules,
    features,
    issued: new Date().toISOString().slice(0, 10),
    expires: String(options.expires || '').trim(),
    note: String(options.note || '').trim(),
    issuer: VENDOR.name,
    issuer_latin: VENDOR.name_latin,
    issuer_url: VENDOR.url,
  };
  const doc = signLicense(payload, fs.readFileSync(keyFile, 'utf8'));
  const outDir = path.resolve(options.out ? path.dirname(options.out) : 'license-keys');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.resolve(options.out || path.join(outDir, `${payload.id}.json`));
  fs.writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
  if (options.quiet) {
    console.log(out);
    return;
  }
  const key = Buffer.from(JSON.stringify(doc), 'utf8').toString('base64');
  console.log(`OK  license created: ${out}`);
  console.log(`  customer: ${payload.customer}  |  serial: ${payload.id}`);
  console.log(`  modules (${modules.length}): ${modules.join(', ')}`);
  if (features.length) console.log(`  single features: ${features.join(', ')}`);
  console.log(`  issuer: ${VENDOR.name_latin} - ${VENDOR.url}`);
  console.log('\nInstall on the customer server (either way):');
  console.log(`  1) put the file in the data folder as:  DATA_DIR/license.json`);
  console.log(`  2) or in .env:  LICENSE_KEY="${key}"`);
  console.log('  and on that host:  LICENSE_MODE=on  then Restart the app.');
  console.log('\nCheck on the customer server: Settings -> Service status (or /api/status)');
}

function inspect(options) {
  const file = path.resolve(options.license || '');
  if (!file || !fs.existsSync(file))
    fail(
      'license path is required: npm run license:inspect -- --license ./license-keys/MY-....json',
    );
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const publicKey = options.key
    ? fs.readFileSync(path.resolve(options.key), 'utf8')
    : fs.existsSync('license-keys/license-public.pem')
      ? fs.readFileSync('license-keys/license-public.pem', 'utf8')
      : '';
  const result = publicKey
    ? verifyLicense(doc, publicKey)
    : { valid: false, reason: 'PUBLIC_KEY_MISSING' };
  console.log(`serial    : ${doc.payload?.id || '-'}    customer: ${doc.payload?.customer || '-'}`);
  console.log(
    `edition   : ${doc.payload?.edition || '-'}    issued: ${doc.payload?.issued || '-'}    expiry: ${doc.payload?.expires || 'lifetime'}`,
  );
  console.log(
    `issuer    : ${doc.payload?.issuer_latin || VENDOR.name_latin} - ${doc.payload?.issuer_url || VENDOR.url}`,
  );
  console.log(`modules   : ${(doc.payload?.modules || []).join(', ')}`);
  if (doc.payload?.features?.length) console.log(`features  : ${doc.payload.features.join(', ')}`);
  console.log(`signature : ${result.valid ? 'VALID' : `INVALID (${result.reason})`}`);
  console.log(
    `fingerprint: ${crypto.createHash('sha256').update(stableSerialize(doc.payload)).digest('hex').slice(0, 16)}`,
  );
  if (ALL_MODULES.length && !result.valid) process.exitCode = 2;
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    customer: { type: 'string' },
    school: { type: 'string' },
    edition: { type: 'string' },
    modules: { type: 'string' },
    features: { type: 'string' },
    id: { type: 'string' },
    note: { type: 'string' },
    expires: { type: 'string' },
    key: { type: 'string' },
    license: { type: 'string' },
    quiet: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
});

const command = positionals[0];
if (!command || values.help) {
  console.log(HELP.trim());
  process.exit(command ? 0 : 1);
}
if (command === 'list') printCatalog();
else if (command === 'keygen') keygen(values);
else if (command === 'issue') issue(values);
else if (command === 'inspect') inspect(values);
else fail(`unknown command: ${command}\n${HELP}`);
