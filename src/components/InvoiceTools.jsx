import React, { useState } from 'react';
import { api, dateFa, describeError, fa, money, today } from '../lib/api';
import { useApp } from '../context';
import { Button, ErrorBox, JalaliDateField, Modal } from './ui';

// Late-fee assessment and instalment planning for invoices (finance module).
export function LateFeeButton({ invoice, onDone }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    setBusy(true);
    try {
      const result = await api(`/finance/invoices/${invoice.id}/late-fee`, {
        method: 'POST',
        body: {},
      });
      toast(`جریمه دیرکرد ${money(result.amount)} اعمال شد.`);
      onDone?.();
    } catch (e) {
      toast(describeError(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="soft" icon="Clock3" loading={busy} onClick={apply}>
      محاسبه جریمه دیرکرد
    </Button>
  );
}

export function InstallmentsButton({ invoice, onDone }) {
  const { toast } = useApp();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({
    amount: invoice.net_amount || invoice.amount,
    discount: invoice.discount || 0,
    count: 3,
    first_due: invoice.due_date || today(),
    interval_days: 30,
    title: invoice.title,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api('/finance/installments', {
        method: 'POST',
        body: {
          student_id: invoice.student_id,
          title: values.title,
          amount: Number(values.amount),
          discount: Number(values.discount),
          count: Number(values.count),
          first_due: values.first_due,
          interval_days: Number(values.interval_days),
        },
      });
      toast(`${fa(result.invoices.length)} قسط به مبلغ کل ${money(result.total)} ثبت شد.`);
      onDone?.();
      setOpen(false);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="soft" icon="CalendarRange" onClick={() => setOpen(true)}>
        تبدیل به اقساط
      </Button>
      {open && (
        <Modal
          title="برنامه اقساط شهریه"
          subtitle={`دانش‌آموز #${fa(invoice.student_id)}`}
          onClose={() => setOpen(false)}
        >
          <div className="modal-body">
            <div className="form-grid">
              <div className="form-field full-width">
                <label htmlFor="inst-title">عنوان</label>
                <input
                  id="inst-title"
                  value={values.title}
                  onChange={(e) => setValues({ ...values, title: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label htmlFor="inst-amount">مبلغ کل (تومان)</label>
                <input
                  id="inst-amount"
                  type="number"
                  min="1"
                  value={values.amount}
                  onChange={(e) => setValues({ ...values, amount: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label htmlFor="inst-discount">تخفیف (تومان)</label>
                <input
                  id="inst-discount"
                  type="number"
                  min="0"
                  value={values.discount}
                  onChange={(e) => setValues({ ...values, discount: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label htmlFor="inst-count">تعداد اقساط</label>
                <input
                  id="inst-count"
                  type="number"
                  min="2"
                  max="12"
                  value={values.count}
                  onChange={(e) => setValues({ ...values, count: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label htmlFor="inst-first">سررسید اولین قسط</label>
                <JalaliDateField
                  id="inst-first"
                  label="سررسید قسط"
                  value={values.first_due}
                  onChange={(iso) => setValues({ ...values, first_due: iso })}
                />
              </div>
              <div className="form-field">
                <label htmlFor="inst-interval">فاصله اقساط (روز)</label>
                <input
                  id="inst-interval"
                  type="number"
                  min="7"
                  max="180"
                  value={values.interval_days}
                  onChange={(e) => setValues({ ...values, interval_days: e.target.value })}
                />
              </div>
            </div>
            <p className="muted small-text">
              مبلغ هر قسط: {money(Math.floor((values.amount - values.discount) / values.count))} —
              اقستان به‌صورت صورتحساب مستقل ثبت می‌شوند.
            </p>
            {error && <ErrorBox error={error} />}
          </div>
          <footer className="modal-footer">
            <Button loading={busy} icon="Save" onClick={submit}>
              ثبت اقساط
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              انصراف
            </Button>
          </footer>
        </Modal>
      )}
    </>
  );
}

// A compact, print-friendly invoice sheet rendered on demand.
export function PrintInvoiceButton({ invoice, studentLabel }) {
  const [open, setOpen] = useState(false);
  const school = useApp().config?.school || {};
  const net =
    invoice.net_amount ?? invoice.amount - (invoice.discount || 0) + (invoice.late_fee || 0);
  const remaining = invoice.remaining ?? Math.max(0, net - (invoice.paid_amount || 0));
  return (
    <>
      <Button variant="secondary" icon="FileText" onClick={() => setOpen(true)}>
        چاپ صورتحساب
      </Button>
      {open && (
        <Modal title="پیش‌نمایش چاپ" wide onClose={() => setOpen(false)}>
          <div className="modal-body">
            <article className="print-sheet invoice-sheet">
              <header className="print-sheet-head">
                <div>
                  <h1>{school.name || 'مدرسه'}</h1>
                  <p>صورتحساب شهریه · {invoice.term || today().slice(0, 4)}</p>
                </div>
                <div className="print-sheet-code">
                  <span>شماره سند</span>
                  <strong dir="ltr">INV-{String(invoice.id).padStart(5, '0')}</strong>
                </div>
              </header>
              <dl className="print-meta">
                <div>
                  <dt>دانش‌آموز</dt>
                  <dd>{studentLabel || `#${fa(invoice.student_id)}`}</dd>
                </div>
                <div>
                  <dt>سررسید</dt>
                  <dd>{dateFa(invoice.due_date)}</dd>
                </div>
                <div>
                  <dt>وضعیت</dt>
                  <dd>{invoice.status === 'paid' ? 'تسویه‌شده' : 'پرداخت‌نشده'}</dd>
                </div>
              </dl>
              <table className="print-table">
                <tbody>
                  <tr>
                    <td>{invoice.title}</td>
                    <td>{money(invoice.amount)}</td>
                  </tr>
                  {Number(invoice.discount || 0) > 0 && (
                    <tr>
                      <td>تخفیف {invoice.discount_reason ? `(${invoice.discount_reason})` : ''}</td>
                      <td>− {money(invoice.discount)}</td>
                    </tr>
                  )}
                  {Number(invoice.late_fee || 0) > 0 && (
                    <tr>
                      <td>جریمه دیرکرد</td>
                      <td>{money(invoice.late_fee)}</td>
                    </tr>
                  )}
                  <tr className="print-total">
                    <td>قابل پرداخت</td>
                    <td>{money(net)}</td>
                  </tr>
                  <tr>
                    <td>پرداخت‌شده</td>
                    <td>{money(invoice.paid_amount || 0)}</td>
                  </tr>
                  <tr className="print-total">
                    <td>مانده</td>
                    <td>{money(remaining)}</td>
                  </tr>
                </tbody>
              </table>
              <footer className="print-signatures">
                <div>
                  <span>مهر و امضای مدرسه</span>
                </div>
                <div>
                  <span>امضای اولیا</span>
                </div>
              </footer>
            </article>
          </div>
          <footer className="modal-footer">
            <Button icon="FileText" onClick={() => window.print()}>
              چاپ
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              بستن
            </Button>
          </footer>
        </Modal>
      )}
    </>
  );
}
