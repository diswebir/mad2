import React, { useState } from 'react';
import { api, dateFa, describeError, fa } from '../lib/api';
import { useApi, useApp } from '../context';
import { Badge, Button, Empty, ErrorBox, Icon, JalaliDateField, Loading, Modal } from './ui';

const typeLabels = {
  sick: 'بیماری',
  family: 'امور خانوادگی',
  event: 'رویداد و مسابقه',
  travel: 'سفر',
  other: 'سایر',
};
const statusLabels = {
  pending: 'در انتظار تأیید',
  approved: 'تأییدشده',
  rejected: 'ردشده',
  cancelled: 'لغوشده',
};
const toneOf = (status) =>
  status === 'approved'
    ? 'green'
    : status === 'pending'
      ? 'orange'
      : status === 'rejected'
        ? 'red'
        : 'neutral';

function RequestForm({ onClose, onSaved }) {
  const { user, lookups, toast } = useApp();
  const [studentId, setStudentId] = useState(user.student_id || '');
  const [type, setType] = useState('sick');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/leaves', {
        method: 'POST',
        body: {
          student_id: studentId ? Number(studentId) : undefined,
          type,
          from_date: from,
          to_date: to || from,
          reason,
        },
      });
      toast('درخواست مرخصی ثبت شد و برای تأیید به مدرسه ارسال شد.');
      onSaved();
      onClose();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="درخواست مرخصی یا غیبت موجه" onClose={onClose}>
      <div className="modal-body">
        <div className="form-grid">
          {!user.student_id && ['admin', 'teacher'].includes(user.role) && (
            <div className="form-field full-width">
              <label htmlFor="leave-student">دانش‌آموز</label>
              <select
                id="leave-student"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
              >
                <option value="">انتخاب دانش‌آموز</option>
                {(lookups.students || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="form-field">
            <label htmlFor="leave-type">نوع</label>
            <select id="leave-type" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="leave-from">از تاریخ</label>
            <JalaliDateField
              id="leave-from"
              label="شروع مرخصی"
              value={from}
              onChange={(iso) => {
                setFrom(iso);
                if (!to) setTo(iso);
              }}
            />
          </div>
          <div className="form-field">
            <label htmlFor="leave-to">تا تاریخ</label>
            <JalaliDateField id="leave-to" label="پایان مرخصی" value={to} onChange={setTo} />
          </div>
          <div className="form-field full-width">
            <label htmlFor="leave-reason">توضیح درخواست</label>
            <textarea
              id="leave-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="دلیل غیبت یا مرخصی را بنویسید..."
            />
          </div>
        </div>
        {error && <ErrorBox error={error} />}
      </div>
      <footer className="modal-footer">
        <Button
          loading={busy}
          disabled={!from || reason.trim().length < 3}
          onClick={submit}
          icon="Send"
        >
          ثبت درخواست
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          انصراف
        </Button>
      </footer>
    </Modal>
  );
}

function Decision({ row, onClose, onSaved }) {
  const { toast } = useApp();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);
  const decide = async (status) => {
    setBusy(status);
    try {
      const result = await api(`/leaves/${row.id}/decision`, {
        method: 'PATCH',
        body: { status, decision_note: note, mark_attendance: true },
      });
      toast(
        status === 'approved'
          ? `تأیید شد${result.marked_days ? ` و ${fa(result.marked_days)} روز حضور موجه ثبت شد.` : '.'}`
          : 'درخواست بررسی و ثبت شد.',
      );
      onSaved();
      onClose();
    } catch (e) {
      toast(describeError(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Modal
      title="بررسی درخواست مرخصی"
      subtitle={`${row.first_name || ''} ${row.last_name || ''} · ${dateFa(row.from_date)} تا ${dateFa(row.to_date)}`}
      onClose={onClose}
    >
      <div className="modal-body">
        <p className="muted">
          <Icon name="Info" size={16} /> نوع: {typeLabels[row.type] || row.type} — {row.reason}
        </p>
        <label className="form-field full-width">
          پاسخ مدرسه (اختیاری)
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <p className="muted small-text">
          با تأیید، روزهای گذشته‌شده این بازه در دفتر حضور به‌صورت «موجه» ثبت می‌شوند.
        </p>
      </div>
      <footer className="modal-footer">
        <Button
          icon="Check"
          loading={busy === 'approved'}
          disabled={!!busy}
          onClick={() => decide('approved')}
        >
          تأیید درخواست
        </Button>
        <Button
          variant="danger"
          icon="X"
          loading={busy === 'rejected'}
          disabled={!!busy}
          onClick={() => decide('rejected')}
        >
          رد درخواست
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={!!busy}>
          بستن
        </Button>
      </footer>
    </Modal>
  );
}

export default function LeavesPanel() {
  const { can, toast } = useApp();
  const [status, setStatus] = useState('');
  const [form, setForm] = useState(false);
  const [decision, setDecision] = useState(null);
  const { data, loading, error, refresh } = useApi(
    can('leaves.view') ? `/leaves${status ? `?status=${status}` : ''}` : null,
  );
  const rows = data?.rows || [];
  const cancel = async (row) => {
    try {
      await api(`/leaves/${row.id}`, { method: 'DELETE', body: {} });
      toast('درخواست لغو شد.');
      refresh();
    } catch (e) {
      toast(describeError(e), 'error');
    }
  };
  if (!can('leaves.view'))
    return <Empty title="این بخش برای نقش شما در دسترس نیست" icon="PlaneTakeoff" />;
  return (
    <section className="panel leaves-panel">
      <div className="panel-heading">
        <div>
          <h2>درخواست‌های مرخصی و غیبت موجه</h2>
          <p className="muted small-text">
            خانواده‌ها درخواست می‌دهند و مدرسه با یک تأیید، غیبت را موجه ثبت می‌کند.
          </p>
        </div>
        <div className="panel-actions">
          <select
            aria-label="فیلتر وضعیت"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">همه وضعیت‌ها</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {can('leaves.submit') && (
            <Button icon="Plus" onClick={() => setForm(true)}>
              درخواست جدید
            </Button>
          )}
        </div>
      </div>
      {data && (
        <div className="leave-stats">
          <Badge tone="orange" dot>
            {fa(data.pending)} در انتظار
          </Badge>
          <Badge tone="green" dot>
            {fa(data.approved)} تأییدشده
          </Badge>
        </div>
      )}
      {error ? (
        <div className="panel-padding">
          <ErrorBox error={error} onRetry={refresh} />
        </div>
      ) : loading && !data ? (
        <Loading rows={4} />
      ) : rows.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>دانش‌آموز</th>
                <th>نوع</th>
                <th>بازه</th>
                <th>توضیح</th>
                <th>وضعیت</th>
                <th className="actions-column">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {`${row.first_name || ''} ${row.last_name || ''}`.trim() ||
                      `#${fa(row.student_id)}`}
                    <small>{row.class_name}</small>
                  </td>
                  <td>{typeLabels[row.type] || row.type}</td>
                  <td>
                    {dateFa(row.from_date)}
                    {row.to_date !== row.from_date ? ` تا ${dateFa(row.to_date)}` : ''}
                  </td>
                  <td className="wrap-cell">{row.reason}</td>
                  <td>
                    <Badge tone={toneOf(row.status)} dot>
                      {statusLabels[row.status]}
                    </Badge>
                  </td>
                  <td>
                    <div className="row-actions">
                      {can('leaves.approve') && row.status === 'pending' && (
                        <Button variant="ghost" icon="Check" onClick={() => setDecision(row)}>
                          بررسی
                        </Button>
                      )}
                      {row.status === 'approved' && row.decision_note && (
                        <span className="muted small-text">{row.decision_note}</span>
                      )}
                      {['pending'].includes(row.status) && can('leaves.submit') && (
                        <Button variant="ghost" icon="X" onClick={() => cancel(row)}>
                          لغو
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="درخواستی در این وضعیت وجود ندارد"
          description="با ثبت درخواست از سوی خانواده یا مدرسه، گردش تأیید آغاز می‌شود."
          icon="PlaneTakeoff"
          action={
            can('leaves.submit') ? (
              <Button icon="Plus" onClick={() => setForm(true)}>
                درخواست جدید
              </Button>
            ) : null
          }
        />
      )}
      {form && <RequestForm onClose={() => setForm(false)} onSaved={refresh} />}
      {decision && <Decision row={decision} onClose={() => setDecision(null)} onSaved={refresh} />}
    </section>
  );
}
