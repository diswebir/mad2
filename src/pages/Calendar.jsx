import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp, useApi } from '../context';
import { api, dateFa, fa, query, today } from '../lib/api';
import {
  Badge,
  Button,
  Confirm,
  Empty,
  ErrorBox,
  Icon,
  IconButton,
  Loading,
  PageHeader,
} from '../components/ui';
import Resources, { GenericDetail, ResourceForm } from './Resources';
const parts = (date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-US-u-ca-persian', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      timeZone: 'UTC',
    })
      .formatToParts(date)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)]),
  );
const addDays = (date, n) => {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};
function monthStart(offset) {
  let d = new Date(today());
  d = addDays(d, 1 - parts(d).day);
  for (let i = 0; i < Math.abs(offset); i++) {
    d = addDays(d, offset > 0 ? 32 : -1);
    d = addDays(d, 1 - parts(d).day);
  }
  return d;
}
const types = {
  meeting: ['جلسه', 'purple'],
  trip: ['اردو', 'green'],
  exam: ['آزمون', 'orange'],
  celebration: ['مناسبت', 'pink'],
  workshop: ['کارگاه', 'blue'],
};
export default function Calendar() {
  const { user, can, toast, refreshLookups } = useApp();
  const [params, setParams] = useSearchParams();
  const [offset, setOffset] = useState(0),
    [mode, setMode] = useState('calendar'),
    [selectedDay, setSelectedDay] = useState(today()),
    [form, setForm] = useState(null),
    [detail, setDetail] = useState(null),
    [remove, setRemove] = useState(null),
    [revision, setRevision] = useState(0);
  const start = useMemo(() => monthStart(offset), [offset]),
    first = addDays(start, -((start.getUTCDay() + 1) % 7)),
    last = addDays(first, 41),
    month = parts(start).month;
  const days = Array.from({ length: 42 }, (_, i) => {
    const date = addDays(first, i);
    return {
      iso: date.toISOString().slice(0, 10),
      ...parts(date),
      inMonth: parts(date).month === month,
    };
  });
  const { data, loading, error, refresh } = useApi(
    can('events.view')
      ? `/calendar?${query({ from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) })}`
      : null,
    revision,
  );
  useEffect(() => {
    if (params.get('id') && can('events.view'))
      api(`/entities/events/${params.get('id')}`)
        .then(setDetail)
        .catch((e) => toast(e.message, 'error'));
  }, [params, can, toast]);
  const close = () => {
    setDetail(null);
    const p = new URLSearchParams(params);
    p.delete('id');
    setParams(p, { replace: true });
  };
  const save = async () => {
    refresh();
    setRevision((r) => r + 1);
    await refreshLookups();
    toast('رویداد مدرسه ذخیره شد.');
  };
  const canWrite = ['admin', 'teacher'].includes(user.role) && can('events.create');
  if (!can('events.view')) return <Empty title="تقویم مدرسه غیرفعال است" icon="CalendarDays" />;
  const agenda = (data || []).filter(
    (e) => e.start_date <= selectedDay && (e.end_date || e.start_date) >= selectedDay,
  );
  return (
    <div className="calendar-page page-enter">
      <PageHeader
        title="تقویم و رویدادها"
        description="برای روزهای پیش رو، با هم برنامه‌ریزی کنیم."
      >
        <div className="segmented">
          <button
            className={mode === 'calendar' ? 'active' : ''}
            onClick={() => setMode('calendar')}
          >
            <Icon name="CalendarDays" size={17} />
            تقویم
          </button>
          <button className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}>
            <Icon name="List" size={17} />
            فهرست
          </button>
        </div>
        {canWrite && (
          <Button icon="Plus" onClick={() => setForm({ defaults: { start_date: selectedDay } })}>
            رویداد جدید
          </Button>
        )}
      </PageHeader>
      {mode === 'list' ? (
        <Resources key={revision} moduleId="calendar" embedded />
      ) : (
        <div className="calendar-layout">
          <section className="panel calendar-panel">
            <div className="calendar-month-heading">
              <div>
                <h2>{dateFa(start, { month: 'long', year: 'numeric' })}</h2>
                <Badge tone="purple">تقویم شمسی</Badge>
              </div>
              <div>
                <IconButton
                  name="ChevronRight"
                  label="ماه قبل"
                  disabled={offset <= -36}
                  onClick={() => setOffset((o) => o - 1)}
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    setOffset(0);
                    setSelectedDay(today());
                  }}
                >
                  امروز
                </Button>
                <IconButton
                  name="ChevronLeft"
                  label="ماه بعد"
                  disabled={offset >= 36}
                  onClick={() => setOffset((o) => o + 1)}
                />
              </div>
            </div>
            {error && <ErrorBox error={error} onRetry={refresh} />}
            <div className="calendar-weekdays">
              {['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className={`calendar-grid ${loading ? 'calendar-loading' : ''}`}>
              {days.map((day, i) => {
                const events = (data || []).filter(
                  (e) => e.start_date <= day.iso && (e.end_date || e.start_date) >= day.iso,
                );
                return (
                  <div
                    className={`calendar-cell ${!day.inMonth ? 'outside-month' : ''} ${day.iso === today() ? 'is-today' : ''} ${day.iso === selectedDay ? 'selected-day' : ''} ${i % 7 === 6 ? 'weekend' : ''}`}
                    key={day.iso}
                  >
                    <button
                      className="calendar-day-number"
                      aria-label={dateFa(day.iso)}
                      onClick={() => setSelectedDay(day.iso)}
                    >
                      {fa(day.day)}
                    </button>
                    {events.slice(0, 2).map((e) => (
                      <button
                        key={e.id}
                        className={`calendar-event tone-${types[e.type]?.[1] || 'purple'}`}
                        onClick={() => setDetail(e)}
                        title={e.title}
                      >
                        <i />
                        {e.title}
                      </button>
                    ))}
                    {events.length > 2 && (
                      <button className="calendar-more" onClick={() => setSelectedDay(day.iso)}>
                        +{fa(events.length - 2)} رویداد
                      </button>
                    )}
                    {canWrite && (
                      <IconButton
                        name="Plus"
                        label={`افزودن رویداد ${dateFa(day.iso)}`}
                        className="calendar-add"
                        onClick={() => {
                          setSelectedDay(day.iso);
                          setForm({ defaults: { start_date: day.iso } });
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="calendar-legend">
              {Object.values(types).map(([label, color]) => (
                <span key={label}>
                  <i className={`legend-${color}`} />
                  {label}
                </span>
              ))}
            </div>
          </section>
          <aside className="panel calendar-agenda">
            <div className="panel-heading">
              <div>
                <h2>برنامه این روز</h2>
                <p>{dateFa(selectedDay, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              </div>
              <span className="small-icon tone-purple">
                <Icon name="CalendarClock" />
              </span>
            </div>
            {loading ? (
              <Loading rows={2} />
            ) : agenda.length ? (
              <div className="agenda-events">
                {agenda.map((e) => (
                  <button key={e.id} onClick={() => setDetail(e)}>
                    <Badge tone={types[e.type]?.[1]}>{types[e.type]?.[0]}</Badge>
                    <h3>{e.title}</h3>
                    <p>
                      <Icon name="Clock3" size={15} />
                      {e.start_time?.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]) || 'تمام روز'}
                    </p>
                    <p>
                      <Icon name="MapPin" size={15} />
                      {e.location || 'مدرسه'}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                title="روزی آرام در تقویم"
                description="برای این روز رویدادی ثبت نشده است."
                icon="CalendarDays"
                action={
                  canWrite ? (
                    <Button
                      variant="soft"
                      icon="Plus"
                      onClick={() => setForm({ defaults: { start_date: selectedDay } })}
                    >
                      افزودن برنامه
                    </Button>
                  ) : null
                }
              />
            )}
            <div className="agenda-note">
              <Icon name="Info" size={17} />
              رویدادهای عمومی و کلاس‌های مجاز شما نمایش داده می‌شوند.
            </div>
          </aside>
        </div>
      )}
      {form && (
        <ResourceForm
          resource="events"
          row={form.row}
          defaults={form.defaults}
          onClose={() => setForm(null)}
          onSaved={save}
        />
      )}{' '}
      {detail && (
        <GenericDetail
          resource="events"
          row={detail}
          onClose={close}
          onEdit={(row) => {
            close();
            setForm({ row });
          }}
          onDelete={setRemove}
        />
      )}{' '}
      {remove && (
        <Confirm
          title="حذف رویداد"
          danger
          description={`رویداد «${remove.title}» حذف شود؟`}
          confirmLabel="حذف رویداد"
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            await api(`/entities/events/${remove.id}`, { method: 'DELETE', body: {} });
            close();
            await save();
          }}
        />
      )}
    </div>
  );
}
