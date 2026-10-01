// Out-of-app notification bridge: SMS and email through a configurable provider.
// Messages are queued in `outbox` first, then delivered lazily (like announcements) so a
// slow or unreachable gateway can never delay or fail a user request.
import { notificationFeature, setOutboxQueue } from './security.js';

const providers = {
  // Generic JSON webhook: works with most local SMS panels and with an email relay.
  webhook: async ({ url, method = 'POST', headers = {}, template }, message) => {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(
        template && typeof template === 'object'
          ? Object.fromEntries(
              Object.entries(template).map(([key, value]) => [
                key,
                String(value)
                  .replaceAll('{{title}}', message.title)
                  .replaceAll('{{body}}', message.body)
                  .replaceAll('{{to}}', message.to || '')
                  .replaceAll('{{name}}', message.name || ''),
              ]),
            )
          : {
              to: message.to,
              title: message.title,
              text: message.body,
              channel: message.channel,
            },
      ),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`gateway responded ${response.status}`);
    return true;
  },
  // Kavenegar-style REST endpoint (Iranian SMS panel): /v1/{key}/sms/send.json
  kavenegar: async ({ url, api_key }, message) => {
    const base = (url || 'https://api.kavenegar.com').replace(/\/$/, '');
    const endpoint = `${base}/v1/${encodeURIComponent(api_key || '')}/sms/send.json?receptor=${encodeURIComponent(
      message.to || '',
    )}&message=${encodeURIComponent(`${message.title}\n${message.body}`)}&sender=${encodeURIComponent(
      message.sender || '',
    )}`;
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`kavenegar responded ${response.status}`);
    const payload = await response.json().catch(() => null);
    if (payload?.return?.status && Number(payload.return.status) !== 200)
      throw new Error(payload.return.message || 'kavenegar rejected the message');
    return true;
  },
  // Local preview / development sink: records the message without contacting the network.
  console: async (_config, message) => {
    console.log(`[outbox:${message.channel}] ${message.to || '-'} — ${message.title}`);
    return true;
  },
};

export const messagingConfig = (db) => ({
  enabled: false,
  sms: { enabled: false, provider: 'console', api_key: '', sender: '', url: '' },
  email: { enabled: false, provider: 'webhook', url: '', headers: {} },
  events: {
    absence: true,
    invoice: true,
    payment: true,
    assignment: true,
    exam: true,
    ticket: true,
    announcement: true,
    leave: true,
    meeting: true,
  },
  ...db.setting('messaging', {}),
});

export function providerFor(config, channel) {
  const settings = channel === 'sms' ? config.sms : config.email;
  return { settings, run: providers[settings?.provider] || providers.console };
}

const eventForFeature = (feature) =>
  ({
    'attendance.view': 'absence',
    'invoices.view': 'invoice',
    'payments.view': 'payment',
    'assignments.view': 'assignment',
    'exams.view': 'exam',
    'tickets.view': 'ticket',
    'announcements.view': 'announcement',
    'leaves.view': 'leave',
    'meeting_slots.view': 'meeting',
  })[feature] || null;

setOutboxQueue((db, userId, payload) => {
  const user = db.get('SELECT id,full_name,phone,email FROM users WHERE id=?', [userId]);
  return user ? enqueueOutbox(db, user, payload) : 0;
});

/**
 * Queue an out-of-app copy of an in-app notification.
 * Never throws: a messaging problem must not break the API request that generated it.
 */
export function enqueueOutbox(db, user, { title, body, link = '/', source_feature = null }) {
  try {
    const config = messagingConfig(db);
    if (!config.enabled || !user) return 0;
    const feature = notificationFeature({ source_feature, title, type: 'info' });
    const event = eventForFeature(feature);
    if (event && config.events?.[event] === false) return 0;
    let queued = 0;
    const rows = [
      config.sms?.enabled && user.phone ? ['sms', user.phone] : null,
      config.email?.enabled && user.email ? ['email', user.email] : null,
    ].filter(Boolean);
    for (const [channel, target] of rows) {
      db.insert('outbox', {
        user_id: user.id,
        channel,
        target,
        title,
        body: `${body}${link && link !== '/' ? `\n${link}` : ''}`.slice(0, 900),
      });
      queued += 1;
    }
    return queued;
  } catch (error) {
    console.error('outbox enqueue failed', error);
    return 0;
  }
}

export async function deliverOutbox(db, security, { limit = 5 } = {}) {
  if (!security.enabled('settings.messaging')) return { processed: 0 };
  const config = messagingConfig(db);
  if (!config.enabled) return { processed: 0 };
  const queued = db.all("SELECT * FROM outbox WHERE status='queued' ORDER BY id LIMIT ?", [limit]);
  let processed = 0;
  for (const message of queued) {
    const user = db.get('SELECT id,full_name FROM users WHERE id=?', [message.user_id || 0]);
    const { settings, run } = providerFor(config, message.channel);
    try {
      await run(settings, {
        to: message.target,
        title: message.title,
        body: message.body,
        channel: message.channel,
        name: user?.full_name || '',
        sender: settings?.sender,
      });
      db.run(
        "UPDATE outbox SET status='sent',attempts=attempts+1,sent_at=datetime('now'),error=NULL WHERE id=?",
        [message.id],
      );
      processed += 1;
    } catch (error) {
      const attempts = (message.attempts || 0) + 1;
      db.run('UPDATE outbox SET attempts=?,error=?,status=? WHERE id=?', [
        attempts,
        String(error.message || error).slice(0, 300),
        attempts >= 5 ? 'failed' : 'queued',
        message.id,
      ]);
    }
  }
  return { processed };
}

export async function deliverTest(db, config, channel = 'sms') {
  const { settings, run } = providerFor(config, channel);
  await run(settings, {
    to: settings?.sender || 'test',
    title: 'پیام آزمایشی مدرسه‌یار',
    body: 'اگر این پیام را دریافت کردید، پل پیام‌رسانی درست تنظیم شده است.',
    channel,
    name: 'مدیر مدرسه',
    sender: settings?.sender,
  });
  return true;
}
