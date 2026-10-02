import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, dateFa, describeError, fa, money } from '../lib/api';
import { useApi, useApp } from '../context';
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Icon,
  JalaliDateField,
  Loading,
  Modal,
  statusTone,
  SearchSelect,
} from './ui';

// Overdue list, renewals, fines and reservations for the library module.
export function LibraryTools({ onChanged }) {
  const { can, toast, lookups } = useApp();
  const [overdue, setOverdue] = useState(false);
  const [reserve, setReserve] = useState(false);
  const [busy, setBusy] = useState(null);
  const report = useApi(overdue && can('loans.view') ? '/library/overdue' : null);

  const act = async (loan, action, body) => {
    setBusy(loan.id);
    try {
      const result = await api(`/library/loans/${loan.id}/${action}`, { method: 'POST', body });
      toast(
        action === 'renew'
          ? `مهلت بازگشت تا ${dateFa(result.due_date)} تمدید شد.`
          : action === 'return'
            ? result.fine > 0
              ? `بازگشت ثبت شد؛ جریمه ${money(result.fine)} (${result.late_days} روز تأخیر).`
              : 'بازگشت کتاب بدون جریمه ثبت شد.'
            : 'وضعیت جریمه ثبت شد.',
      );
      report.refresh();
      onChanged?.();
    } catch (e) {
      toast(describeError(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      {can('loans.view') && (
        <Button variant="secondary" icon="Clock3" onClick={() => setOverdue(true)}>
          دیرکرد و جریمه‌ها
        </Button>
      )}
      {can('library.reserve') && (
        <Button variant="secondary" icon="Bookmark" onClick={() => setReserve(true)}>
          رزرو کتاب
        </Button>
      )}
      {overdue && (
        <Modal
          title="کتاب‌های دیرکرد و جریمه"
          subtitle="تمدید با رعایت سقف و نوبت‌دهندگان انجام می‌شود."
          wide
          onClose={() => setOverdue(false)}
        >
          <div className="modal-body">
            {report.error ? (
              <ErrorBox error={report.error} onRetry={report.refresh} />
            ) : report.loading && !report.data ? (
              <Loading rows={4} />
            ) : report.data?.rows?.length ? (
              <>
                <p className="muted small-text">
                  {fa(report.data.rows.length)} امانت دیرکرد دارد · مجموع جریمه محاسبه‌شده:{' '}
                  {money(report.data.rows.reduce((sum, row) => sum + (row.fine || 0), 0))}
                </p>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>دانش‌آموز</th>
                        <th>کتاب</th>
                        <th>مهلت</th>
                        <th>تأخیر</th>
                        <th>جریمه</th>
                        <th className="actions-column">عملیات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.data.rows.map((loan) => (
                        <tr key={loan.id}>
                          <td>
                            {`${loan.first_name || ''} ${loan.last_name || ''}`.trim() ||
                              `#${fa(loan.student_id)}`}
                          </td>
                          <td>{loan.book_title || `#${fa(loan.book_id)}`}</td>
                          <td>{dateFa(loan.due_date)}</td>
                          <td>
                            <Badge tone={loan.late_days > 14 ? 'red' : 'orange'}>
                              {fa(loan.late_days)} روز
                            </Badge>
                          </td>
                          <td>{money(loan.fine)}</td>
                          <td>
                            <div className="row-actions">
                              {can('library.renew') && (
                                <Button
                                  variant="ghost"
                                  icon="RefreshCw"
                                  loading={busy === loan.id}
                                  onClick={() => act(loan, 'renew')}
                                >
                                  تمدید
                                </Button>
                              )}
                              {can('loans.edit') && (
                                <Button
                                  variant="ghost"
                                  icon="Check"
                                  loading={busy === loan.id}
                                  onClick={() => act(loan, 'return', { fine_paid: false })}
                                >
                                  بازگشت
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <Empty
                title="هیچ کتابی دیرکرد ندارد"
                description="همه امانت‌ها در مهلت خود هستند."
                icon="BookMarked"
              />
            )}
          </div>
          <footer className="modal-footer">
            <Button variant="secondary" onClick={() => setOverdue(false)}>
              بستن
            </Button>
          </footer>
        </Modal>
      )}
      {reserve && (
        <ReserveForm
          onClose={() => setReserve(false)}
          onSaved={() => {
            toast('رزرو ثبت شد؛ هنگام آماده‌شدن کتاب به شما اطلاع می‌دهیم.');
            report.refresh();
            onChanged?.();
          }}
        />
      )}
      {lookups && null}
    </>
  );
}

function ReserveForm({ onClose, onSaved }) {
  const { lookups } = useApp();
  const [bookId, setBookId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/library/reservations', {
        method: 'POST',
        body: {
          book_id: Number(bookId),
          student_id: Number(studentId),
          needed_by: neededBy || null,
          note,
        },
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="رزرو کتاب"
      subtitle="وقتی کتاب آماده شد، نوبت به خانواده اطلاع داده می‌شود."
      onClose={onClose}
    >
      <div className="modal-body">
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="reserve-book">کتاب</label>
            <SearchSelect
              id="reserve-book"
              value={bookId}
              onChange={setBookId}
              placeholder="عنوان کتاب را جست‌وجو کنید..."
              ariaLabel="کتاب"
              options={(lookups.books || []).map((b) => ({ value: b.id, label: b.label }))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="reserve-student">دانش‌آموز</label>
            <SearchSelect
              id="reserve-student"
              value={studentId}
              onChange={setStudentId}
              placeholder="نام دانش‌آموز را جست‌وجو کنید..."
              ariaLabel="دانش‌آموز"
              options={(lookups.students || []).map((s) => ({ value: s.id, label: s.label }))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="reserve-date">موردنیاز تا تاریخ</label>
            <JalaliDateField
              id="reserve-date"
              label="تاریخ موردنیاز"
              value={neededBy}
              onChange={setNeededBy}
            />
          </div>
          <div className="form-field full-width">
            <label htmlFor="reserve-note">توضیحات</label>
            <textarea
              id="reserve-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        {error && <ErrorBox error={error} />}
      </div>
      <footer className="modal-footer">
        <Button loading={busy} disabled={!bookId || !studentId} onClick={submit} icon="Bookmark">
          ثبت رزرو
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          انصراف
        </Button>
      </footer>
    </Modal>
  );
}

// Loan detail adds the circulation actions the old build only had in the API.
export function LoanDetail({ row, onClose, onChanged }) {
  const { can, toast } = useApp();
  const [current, setCurrent] = useState(row);
  const [busy, setBusy] = useState(null);
  const refresh = async () => {
    setCurrent(await api(`/entities/loans/${row.id}`));
    onChanged?.();
  };
  const act = async (action, body) => {
    setBusy(action);
    try {
      const result = await api(`/library/loans/${row.id}/${action}`, { method: 'POST', body });
      toast(
        action === 'renew'
          ? `مهلت بازگشت تا ${dateFa(result.due_date)} تمدید شد.`
          : action === 'return'
            ? result.fine > 0
              ? `بازگشت ثبت شد؛ جریمه ${money(result.fine)}`
              : 'بازگشت ثبت شد؛ جریمه‌ای لازم نبود.'
            : 'وضعیت جریمه به‌روزرسانی شد.',
      );
      await refresh();
    } catch (e) {
      toast(describeError(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Modal
      title="امانت کتاب"
      subtitle={`کتاب #${fa(current.book_id)} · دانش‌آموز #${fa(current.student_id)}`}
      onClose={onClose}
    >
      <div className="modal-body">
        <dl className="detail-list">
          <div>
            <dt>تاریخ امانت</dt>
            <dd>{dateFa(current.borrow_date)}</dd>
          </div>
          <div>
            <dt>مهلت بازگشت</dt>
            <dd>{dateFa(current.due_date)}</dd>
          </div>
          <div>
            <dt>تاریخ بازگشت</dt>
            <dd>{current.return_date ? dateFa(current.return_date) : 'بازگشت داده نشده'}</dd>
          </div>
          <div>
            <dt>تمدیدها</dt>
            <dd>{fa(current.renewals || 0)} بار</dd>
          </div>
          <div>
            <dt>جریمه</dt>
            <dd>
              {money(current.fine || 0)}{' '}
              <Badge
                tone={statusTone(
                  current.fine_status === 'paid'
                    ? 'paid'
                    : current.fine_status === 'due'
                      ? 'unpaid'
                      : 'active',
                )}
                dot
              >
                {current.fine_status === 'paid'
                  ? 'پرداخت‌شده'
                  : current.fine_status === 'due'
                    ? 'بدهکار'
                    : 'بدون جریمه'}
              </Badge>
            </dd>
          </div>
        </dl>
        {current.notes && <p className="muted">{current.notes}</p>}
      </div>
      <footer className="modal-footer">
        {!current.return_date && can('library.renew') && (
          <Button icon="RefreshCw" loading={busy === 'renew'} onClick={() => act('renew')}>
            تمدید
          </Button>
        )}
        {!current.return_date && can('loans.edit') && (
          <Button
            variant="soft"
            icon="Check"
            loading={busy === 'return'}
            onClick={() => act('return', { fine_paid: false })}
          >
            ثبت بازگشت
          </Button>
        )}
        {Number(current.fine || 0) > 0 && can('library.fines') && (
          <Button
            variant="secondary"
            icon="HandCoins"
            loading={busy === 'fine'}
            onClick={() => act('fine', { paid: current.fine_status !== 'paid' })}
          >
            {current.fine_status === 'paid' ? 'علامت‌گذاری بدهکار' : 'ثبت پرداخت جریمه'}
          </Button>
        )}
        <Link className="btn btn-secondary" to="/library?tab=loans">
          همه امانت‌ها
        </Link>
        <Button variant="secondary" onClick={onClose}>
          بستن
        </Button>
      </footer>
    </Modal>
  );
}
