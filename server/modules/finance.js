// Tuition desk: instalment plans, late-fee handling and the debtor report.
import { Router } from 'express';
import { z } from 'zod';
import { assert, parse, log, notify, today, positiveId, csv, scope } from '../security.js';
import { addDateDays } from '../../shared/dates.js';
import { buildXlsx, sheetsFromRows } from '../../shared/xlsx.js';

export function financeRouter(db, security) {
  const router = Router();
  router.use(security.auth);
  const settings = () => ({ late_fee_percent: 0, grace_days: 7, ...db.setting('finance', {}) });
  const payable = (invoice) =>
    Math.max(
      0,
      Number(invoice.amount || 0) - Number(invoice.discount || 0) + Number(invoice.late_fee || 0),
    );
  const overdueDays = (invoice) =>
    Math.max(0, Math.round((Date.parse(today()) - Date.parse(invoice.due_date)) / 86400000));
  const withAging = (invoice) => {
    const remaining = Math.max(0, payable(invoice) - Number(invoice.paid_amount || 0));
    const days = remaining > 0 ? overdueDays(invoice) : 0;
    return {
      ...invoice,
      net_amount: payable(invoice),
      remaining,
      overdue_days: days,
      bucket: days === 0 ? 'current' : days <= 30 ? '0-30' : days <= 60 ? '31-60' : '60+',
      suggested_fee: Math.round((remaining * Number(settings().late_fee_percent || 0)) / 100),
    };
  };
  router.get('/settings', security.feature('invoices.view'), (req, res) => {
    assert(req.user.role === 'admin', 403, 'تنظیمات مالی فقط برای مدیر است.');
    res.json(settings());
  });
  router.patch('/settings', security.feature('invoices.edit'), (req, res) => {
    const data = parse(
      z.object({
        late_fee_percent: z.number().min(0).max(100).default(0),
        grace_days: z.number().int().min(0).max(90).default(7),
      }),
      req.body,
    );
    db.transaction(() => {
      db.setSetting('finance', data);
      log(db, req.user, 'finance.settings', 'settings', null, data);
    });
    res.json(data);
  });

  router.get('/debtors', security.feature('reports.debtors'), (req, res) => {
    const s = scope(db, 'invoices', req.user);
    const rows = db
      .all(
        `SELECT r.*,st.first_name,st.last_name,c.name class_name FROM invoices r
         JOIN students st ON st.id=r.student_id JOIN classes c ON c.id=st.class_id
         WHERE (${s.sql}) ORDER BY r.due_date`,
        s.params,
      )
      .map(withAging)
      .filter((row) => row.remaining > 0)
      .sort((a, b) => b.overdue_days - a.overdue_days);
    const totals = {
      remaining: rows.reduce((sum, row) => sum + row.remaining, 0),
      overdue: rows
        .filter((row) => row.overdue_days > settings().grace_days)
        .reduce((sum, row) => sum + row.remaining, 0),
      families: new Set(rows.map((row) => row.student_id)).size,
      suggested_fee: rows.reduce((sum, row) => sum + row.suggested_fee, 0),
    };
    const format = String(req.query.format || '').toLowerCase();
    const columns = [
      { key: 'name', label: 'دانش‌آموز' },
      { key: 'class_name', label: 'کلاس' },
      { key: 'title', label: 'صورتحساب' },
      { key: 'due_date', label: 'سررسید' },
      { key: 'net_amount', label: 'قابل پرداخت' },
      { key: 'paid_amount', label: 'پرداخت‌شده' },
      { key: 'remaining', label: 'مانده' },
      { key: 'overdue_days', label: 'روز تأخیر' },
      { key: 'bucket', label: 'سطل بدهی' },
    ];
    const output = rows.map((row) => ({ ...row, name: `${row.first_name} ${row.last_name}` }));
    if (format === 'xlsx') {
      assert(security.enabled('exports.xlsx'), 403, 'خروجی اکسل غیرفعال است.', 'FEATURE_DISABLED');
      res.setHeader('Content-Disposition', `attachment; filename="debtors-${today()}.xlsx"`);
      res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buildXlsx(sheetsFromRows(columns, output, 'بدهکاران')));
    }
    if (format === 'csv') {
      res.setHeader('Content-Disposition', `attachment; filename="debtors-${today()}.csv"`);
      return res.type('text/csv; charset=utf-8').send(csv(output, columns));
    }
    return res.json({ rows, totals, settings: settings() });
  });

  router.post('/invoices/:id/late-fee', security.feature('finance.late_fee'), (req, res) => {
    const invoice = db.get('SELECT * FROM invoices WHERE id=?', [positiveId(req.params.id)]);
    assert(invoice, 404, 'صورتحساب پیدا نشد.');
    const data = parse(
      z.object({ amount: z.number().int().min(0).max(1000000000).optional() }),
      req.body,
    );
    const current = withAging(invoice);
    assert(current.remaining > 0, 409, 'این صورتحساب تسویه شده است.');
    assert(
      current.overdue_days > settings().grace_days,
      409,
      `تا ${settings().grace_days} روز پس از سررسید، جریمه اعمال نمی‌شود.`,
    );
    const amount = data.amount ?? current.suggested_fee;
    assert(amount > 0, 422, 'مبلغ جریمه محاسبه نشد؛ درصد جریمه را در تنظیمات مالی وارد کنید.');
    db.transaction(() => {
      db.run(
        "UPDATE invoices SET late_fee=COALESCE(late_fee,0)+?,revision=revision+1,updated_at=datetime('now') WHERE id=?",
        [amount, invoice.id],
      );
      const paid = db.get('SELECT COALESCE(SUM(amount),0) n FROM payments WHERE invoice_id=?', [
        invoice.id,
      ]).n;
      const updated = db.get('SELECT * FROM invoices WHERE id=?', [invoice.id]);
      db.run('UPDATE invoices SET paid_amount=?,net_amount=?,remaining=?,status=? WHERE id=?', [
        paid,
        payable(updated),
        Math.max(0, payable(updated) - paid),
        paid >= payable(updated) ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
        invoice.id,
      ]);
      for (const row of db.all('SELECT user_id,guardian_user_id FROM students WHERE id=?', [
        invoice.student_id,
      ]))
        for (const uid of [row.user_id, row.guardian_user_id].filter(Boolean))
          notify(
            db,
            uid,
            'جریمه دیرکرد اعمال شد',
            `مبلغ ${amount.toLocaleString('fa-IR')} تومان برای «${invoice.title}»`,
            '/finance?tab=invoices',
            'info',
            'invoices.view',
          );
      log(db, req.user, 'finance.late_fee', 'invoices', invoice.id, { amount });
    });
    res.json({ ok: true, amount });
  });

  router.post('/installments', security.feature('finance.installments'), (req, res) => {
    const data = parse(
      z.object({
        student_id: z.number().int().positive(),
        title: z.string().trim().min(2).max(120),
        amount: z.number().int().min(1),
        discount: z.number().int().min(0).default(0),
        count: z.number().int().min(2).max(12),
        first_due: z.string(),
        interval_days: z.number().int().min(7).max(180).default(30),
        term: z.string().max(40).optional().default(''),
        notes: z.string().max(1000).optional().default(''),
      }),
      req.body,
    );
    const student = db.get('SELECT * FROM students WHERE id=?', [data.student_id]);
    assert(student, 404, 'دانش‌آموز پیدا نشد.');
    assert(data.discount < data.amount, 422, 'تخفیف باید کمتر از مبلغ کل باشد.');
    assert(/^\d{4}-\d{2}-\d{2}$/.test(data.first_due), 422, 'تاریخ اولین قسط معتبر نیست.');
    const net = data.amount - data.discount;
    const base = Math.floor(net / data.count);
    const created = [];
    db.transaction(() => {
      for (let index = 0; index < data.count; index += 1) {
        const amount = index === data.count - 1 ? net - base * (data.count - 1) : base;
        const due = addDateDays(data.first_due, index * data.interval_days);
        const id = db.insert('invoices', {
          title: `${data.title} — قسط ${index + 1} از ${data.count}`,
          student_id: student.id,
          amount,
          discount: index === 0 ? data.discount : 0,
          discount_reason: index === 0 && data.discount ? 'تخفیف برنامهٔ اقساط' : null,
          installment_no: index + 1,
          installment_total: data.count,
          due_date: due,
          term: data.term,
          notes: data.notes,
          status: 'unpaid',
          paid_amount: 0,
          net_amount: amount - (index === 0 ? data.discount : 0),
          remaining: amount - (index === 0 ? data.discount : 0),
          author_id: req.user.id,
        });
        created.push({ id, due_date: due, amount });
      }
      const owner = db.get('SELECT user_id,guardian_user_id FROM students WHERE id=?', [
        data.student_id,
      ]);
      for (const uid of [owner?.user_id, owner?.guardian_user_id].filter(Boolean))
        notify(
          db,
          uid,
          'برنامهٔ اقساط ثبت شد',
          `${data.title}: ${data.count} قسط، اولین سررسید ${data.first_due}`,
          '/finance?tab=invoices',
          'info',
          'invoices.view',
        );
      log(db, req.user, 'finance.installments', 'invoices', created[0]?.id || null, {
        count: data.count,
        total: net,
      });
    });
    res.status(201).json({ ok: true, invoices: created, total: net });
  });
  return router;
}
