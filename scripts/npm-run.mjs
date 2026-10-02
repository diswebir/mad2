// اجرای cross-platform دستورهای npm.
// چرا؟ از Node 18.20/20.12/21.7 به بعد (رفع CVE-2024-27980)، اجرای مستقیمِ
// npm.cmd روی ویندوز با spawn/execFile بدون shell خطای EINVAL می‌دهد.
// راه‌حل: اگر npm از طریق خودش اجرا شده باشد (npm_execpath)، همان npm-cli.js را با
// node اجرا می‌کنیم (بدون shell، روی همهٔ سیستم‌عامل‌ها)؛ وگرنه spawn با shell روی ویندوز.
import { execFileSync } from 'node:child_process';

export function npmInvocation(args) {
  const cli = process.env.npm_execpath;
  if (cli && /npm-cli\.js$/.test(cli)) {
    return [process.execPath, [cli, ...args], {}];
  }
  return [
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args,
    { shell: process.platform === 'win32' },
  ];
}

export function runNpm(args, opts = {}) {
  const [file, argv, extra] = npmInvocation(args);
  return execFileSync(file, argv, {
    stdio: ['ignore', 'ignore', 'inherit'],
    ...extra,
    ...opts,
  });
}
