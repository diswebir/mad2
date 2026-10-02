import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, dateFa, describeError, fa, query } from '../lib/api';
import { useApi, useApp } from '../context';
import {
  Badge,
  Button,
  Confirm,
  Empty,
  ErrorBox,
  Icon,
  IconButton,
  Loading,
  Modal,
  JalaliDateField,
  PageHeader,
  statusTone,
  SearchSelect,
} from '../components/ui';

const slotTone = (slot) =>
  slot.seats_left === 0 ? 'red' : slot.seats_left <= 2 ? 'orange' : 'green';

function BookSlot({ slot, onClose, onSaved }) {
  const { toast, lookups } = useApp();
  const [studentId, setStudentId] = useState('');
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const book = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/meetings/book', {
        method: 'POST',
        body: { slot_id: slot.id, student_id: Number(studentId), question },
      });
      toast('نوبت ملاقات ثبت شد؛ پیام تأیید برای شما ارسال می‌شود.');
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
      title="گرفتن نوبت ملاقات"
      subtitle={`${slot.title} · ${dateFa(slot.event_date)} · ${slot.start_time}`}
      onClose={onClose}
    >
      <div className="modal-body">
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="booking-student">دانش‌آموز</label>
            <SearchSelect
              id="booking-student"
              value={studentId}
              onChange={setStudentId}
              placeholder="نام دانش‌آموز را جست‌وجو کنید..."
              ariaLabel="دانش‌آموز"
              options={(lookups.students || []).map((s) => ({ value: s.id, label: s.label }))}
            />
          </div>
          <div className="form-field full-width">
            <label htmlFor="booking-question">موضوع گفت‌وگو</label>
            <textarea
              id="booking-question"
              rows={3}
              maxLength={1000}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="چه موضوعی را می‌خواهید با معلم در میان بگذارید؟"
            />
          </div>
        </div>
        {error && <ErrorBox error={error} />}
      </div>
      <footer className="modal-footer">
        <Button loading={busy} disabled={!studentId} onClick={book} icon="CalendarCheck">
          ثبت نوبت
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          انصراف
        </Button>
      </footer>
    </Modal>
  );
}

function SlotForm({ onClose, onSaved }) {
  const { toast } = useApp();
  const { data: lookups } = useApi('/lookups');
  const [values, setValues] = useState({
    title: 'جلسه اولیا و مربیان',
    event_date: '',
    start_time: '16:00',
    end_time: '18:00',
    teacher_id: '',
    class_id: '',
    capacity: 8,
    location: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/meetings/slots', {
        method: 'POST',
        body: {
          ...values,
          teacher_id: Number(values.teacher_id),
          class_id: Number(values.class_id),
          capacity: Number(values.capacity),
        },
      });
      toast('بازه ملاقات ایجاد شد.');
      onSaved();
      onClose();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  const field = (name, label, type = 'text', extra = {}) => (
    <div className="form-field">
      <label htmlFor={`slot-${name}`}>{label}</label>
      <input
        id={`slot-${name}`}
        type={type}
        value={values[name]}
        {...extra}
        onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
      />
    </div>
  );
  return (
    <Modal title="بازه ملاقات جدید" onClose={onClose}>
      <div className="modal-body">
        <div className="form-grid">
          <div className="form-field full-width">
            <label htmlFor="slot-title">عنوان جلسه</label>
            <input
              id="slot-title"
              value={values.title}
              onChange={(e) => setValues({ ...values, title: e.target.value })}
            />
          </div>
          <div className="form-field">
            <label htmlFor="slot-event_date">تاریخ جلسه</label>
            <JalaliDateField
              id="slot-event_date"
              label="تاریخ جلسه"
              value={values.event_date}
              onChange={(iso) => setValues({ ...values, event_date: iso })}
            />
          </div>
          {field('start_time', 'ساعت شروع', 'time')}
          {field('end_time', 'ساعت پایان', 'time')}
          {field('capacity', 'ظرفیت هر بازه', 'number', { min: 1, max: 60 })}
          <div className="form-field">
            <label htmlFor="slot-teacher">معلم</label>
            <SearchSelect
              id="slot-teacher"
              value={values.teacher_id}
              onChange={(v) => setValues({ ...values, teacher_id: v })}
              placeholder="نام معلم را جست‌وجو کنید..."
              ariaLabel="معلم"
              options={(lookups?.teachers || []).map((t) => ({ value: t.id, label: t.label }))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="slot-class">کلاس</label>
            <SearchSelect
              id="slot-class"
              value={values.class_id}
              onChange={(v) => setValues({ ...values, class_id: v })}
              placeholder="جست‌وجو یا انتخاب کلاس..."
              ariaLabel="کلاس"
              options={(lookups?.classes || []).map((c) => ({ value: c.id, label: c.label }))}
            />
          </div>
          <div className="form-field full-width">
            <label htmlFor="slot-location">مکان</label>
            <input
              id="slot-location"
              value={values.location}
              onChange={(e) => setValues((v) => ({ ...v, location: e.target.value }))}
            />
          </div>
        </div>
        {error && <ErrorBox error={error} />}
      </div>
      <footer className="modal-footer">
        <Button
          loading={busy}
          disabled={!values.event_date || !values.teacher_id || !values.class_id}
          onClick={save}
          icon="Save"
        >
          ثبت بازه
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          انصراف
        </Button>
      </footer>
    </Modal>
  );
}

export default function Meetings() {
  const { user, can, toast } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'bookings' ? 'bookings' : 'slots';
  const [form, setForm] = useState(false);
  const [booking, setBooking] = useState(null);
  const [remove, setRemove] = useState(null);
  const slots = useApi(can('meeting_slots.view') ? `/meetings/slots?${query({})}` : null);
  const bookings = useApi(tab === 'bookings' ? '/meetings/bookings' : null);
  const manage = user.role === 'admin' || user.role === 'teacher';
  const rows = useMemo(() => slots.data?.rows || [], [slots.data]);
  const bookingRows = useMemo(
    () => (Array.isArray(bookings.data) ? bookings.data : []),
    [bookings.data],
  );
  const change = async (row, status) => {
    try {
      await api(`/meetings/bookings/${row.id}`, { method: 'PATCH', body: { status } });
      toast('وضعیت نوبت به‌روزرسانی شد.');
      bookings.refresh();
      slots.refresh();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  const cancelSlot = async () => {
    await api(`/meetings/slots/${remove.id}`, { method: 'DELETE' });
    toast('بازه ملاقات حذف شد.');
    slots.refresh();
  };
  return (
    <div className="meetings-page page-enter">
      <PageHeader
        title="ملاقات اولیا و مربیان"
        description="زمان‌های ملاقات را تعیین کنید و خانواده‌ها بدون تماس تلفنی نوبت بگیرند."
        eyebrow="ارتباط خانواده و مدرسه"
      >
        {manage && can('meetings.manage') && (
          <Button icon="Plus" onClick={() => setForm(true)}>
            بازه ملاقات جدید
          </Button>
        )}
      </PageHeader>
      <div className="tabs">
        <button
          className={tab === 'slots' ? 'active' : ''}
          onClick={() => setParams({ tab: 'slots' })}
        >
          <Icon name="CalendarClock" size={17} />
          زمان‌های ملاقات
        </button>
        <button
          className={tab === 'bookings' ? 'active' : ''}
          onClick={() => setParams({ tab: 'bookings' })}
        >
          <Icon name="CalendarCheck2" size={17} />
          نوبت‌های ثبت‌شده
        </button>
      </div>
      {tab === 'slots' ? (
        <section className="panel">
          {slots.error ? (
            <div className="panel-padding">
              <ErrorBox error={slots.error} onRetry={slots.refresh} />
            </div>
          ) : slots.loading && !slots.data ? (
            <Loading rows={4} />
          ) : rows.length ? (
            <div className="meeting-slot-grid">
              {rows.map((slot) => (
                <article className="meeting-slot" key={slot.id}>
                  <header>
                    <div>
                      <h3>{slot.title}</h3>
                      <p>
                        <Icon name="CalendarDays" size={15} /> {dateFa(slot.event_date)} ·{' '}
                        {slot.start_time} تا {slot.end_time}
                      </p>
                    </div>
                    <Badge tone={slotTone(slot)} dot>
                      {slot.seats_left > 0 ? `${fa(slot.seats_left)} جای خالی` : 'تکمیل'}
                    </Badge>
                  </header>
                  <ul className="meeting-slot-meta">
                    <li>
                      <Icon name="UsersRound" size={16} /> {slot.teacher_name || 'معلم'}
                    </li>
                    <li>
                      <Icon name="School" size={16} /> {slot.class_name || 'کلاس'}
                    </li>
                    {slot.location && (
                      <li>
                        <Icon name="MapPin" size={16} /> {slot.location}
                      </li>
                    )}
                    <li>
                      <Icon name="ContactRound" size={16} /> ظرفیت {fa(slot.capacity)} نفر ·{' '}
                      {fa(slot.booked)} نوبت ثبت‌شده
                    </li>
                  </ul>
                  <div className="meeting-slot-actions">
                    <Button
                      icon="CalendarCheck"
                      disabled={
                        slot.seats_left === 0 ||
                        !['admin', 'parent', 'student'].includes(user.role) ||
                        slot.event_date < new Date().toISOString().slice(0, 10)
                      }
                      onClick={() => setBooking(slot)}
                    >
                      گرفتن نوبت
                    </Button>
                    {manage && can('meetings.manage') && (
                      <IconButton
                        name="Trash2"
                        label="حذف بازه"
                        className="delete-action"
                        onClick={() => setRemove(slot)}
                      />
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="هنوز بازه ملاقاتی ثبت نشده"
              description="با ساخت بازه، خانواده‌ها می‌توانند نوبت خود را رزرو کنند."
              icon="CalendarClock"
              action={
                manage && can('meetings.manage') ? (
                  <Button icon="Plus" onClick={() => setForm(true)}>
                    بازه ملاقات جدید
                  </Button>
                ) : null
              }
            />
          )}
        </section>
      ) : (
        <section className="panel">
          {bookings.error ? (
            <div className="panel-padding">
              <ErrorBox error={bookings.error} onRetry={bookings.refresh} />
            </div>
          ) : bookings.loading && !bookings.data ? (
            <Loading rows={5} />
          ) : bookingRows.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>خانواده</th>
                    <th>دانش‌آموز</th>
                    <th>زمان ملاقات</th>
                    <th>موضوع</th>
                    <th>وضعیت</th>
                    <th className="actions-column">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {bookingRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.parent_name}</strong>
                        <small dir="ltr">{row.phone || ''}</small>
                      </td>
                      <td>
                        {`${row.first_name || ''} ${row.last_name || ''}`.trim() ||
                          `#${fa(row.student_id)}`}
                      </td>
                      <td>
                        {dateFa(row.event_date)} · {row.start_time}
                        <small>{row.teacher_name}</small>
                      </td>
                      <td className="wrap-cell">{row.question || '—'}</td>
                      <td>
                        <Badge tone={statusTone(row.status)} dot>
                          {row.status === 'booked'
                            ? 'رزروشده'
                            : row.status === 'attended'
                              ? 'حضور یافت'
                              : row.status === 'missed'
                                ? 'حاضر نشد'
                                : 'لغوشده'}
                        </Badge>
                      </td>
                      <td>
                        <div className="row-actions">
                          {manage && row.status === 'booked' && (
                            <>
                              <IconButton
                                name="Check"
                                label="حضور یافت"
                                onClick={() => change(row, 'attended')}
                              />
                              <IconButton
                                name="X"
                                label="حاضر نشد"
                                onClick={() => change(row, 'missed')}
                              />
                            </>
                          )}
                          {(manage || !['admin', 'teacher'].includes(user.role)) &&
                            row.status !== 'cancelled' && (
                              <IconButton
                                name="CircleOff"
                                label="لغو نوبت"
                                className="delete-action"
                                onClick={() => change(row, 'cancelled')}
                              />
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="هنوز نوبتی ثبت نشده" icon="CalendarCheck2" />
          )}
        </section>
      )}
      {form && <SlotForm onClose={() => setForm(false)} onSaved={slots.refresh} />}
      {booking && (
        <BookSlot slot={booking} onClose={() => setBooking(null)} onSaved={slots.refresh} />
      )}
      {remove && (
        <Confirm
          title="حذف بازه ملاقات"
          description="این بازه و نوبت‌های آن حذف شوند؟"
          danger
          confirmLabel="بله، حذف شود"
          onConfirm={cancelSlot}
          onClose={() => setRemove(null)}
        />
      )}
    </div>
  );
}
