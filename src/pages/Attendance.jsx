import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp, useApi } from '../context';
import LeavesPanel from '../components/LeavesPanel';
import { api, dateFa, download, fa, labelMap, query, today } from '../lib/api';
import {
  Avatar,
  Badge,
  Button,
  Confirm,
  Empty,
  ErrorBox,
  Icon,
  Loading,
  PageHeader,
  SearchInput,
  statusTone,
} from '../components/ui';
const statuses = [
  ['present', 'حاضر', 'Check', 'green'],
  ['absent', 'غایب', 'X', 'red'],
  ['late', 'تأخیر', 'Clock3', 'orange'],
  ['excused', 'موجه', 'ShieldCheck', 'purple'],
];
export default function Attendance() {
  const { user, can, lookups, toast } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'leaves' && can('leaves.view') ? 'leaves' : 'roll';
  const [classId, setClassId] = useState(lookups.classes?.[0]?.id || ''),
    [date, setDate] = useState(today()),
    [draft, setDraft] = useState({}),
    [search, setSearch] = useState(''),
    [busy, setBusy] = useState(false),
    [exporting, setExporting] = useState(false),
    [pending, setPending] = useState(null);
  const editable = ['admin', 'teacher'].includes(user.role) && can('attendance.record');
  const { data, loading, error, refresh } = useApi(
    can('attendance.view') ? `/attendance?${query({ class_id: classId, date })}` : null,
  );
  const history = useApi(
    ['student', 'parent'].includes(user.role) && can('attendance.history')
      ? `/attendance/student/${user.student_id}`
      : null,
  );
  useEffect(() => {
    if (data)
      setDraft(
        Object.fromEntries(
          data.rows.map((r) => [r.student_id, { status: r.status || '', note: r.note || '' }]),
        ),
      );
  }, [data]);
  // Lookups arrive asynchronously; without this the selector shows a class while the
  // request is still unscoped (and saving would send an empty class_id).
  useEffect(() => {
    const classes = lookups.classes || [];
    if (!classes.length) return;
    if (!classId || !classes.some((c) => c.id === Number(classId))) setClassId(classes[0].id);
  }, [lookups.classes, classId]);
  const changed =
    data?.rows.filter(
      (r) =>
        draft[r.student_id] &&
        (draft[r.student_id].status !== (r.status || '') ||
          draft[r.student_id].note !== (r.note || '')),
    ) || [];
  const rows = data?.rows.filter((r) => `${r.first_name} ${r.last_name}`.includes(search)) || [];
  const summary = useMemo(() => {
    const s = { present: 0, absent: 0, late: 0, excused: 0 };
    Object.values(draft).forEach((r) => {
      if (r.status) s[r.status]++;
    });
    return s;
  }, [draft]);
  const changeScope = (action) => {
    if (changed.length) setPending(() => action);
    else action();
  };
  const markAll = () =>
    setDraft(
      Object.fromEntries(
        (data?.rows || []).map((r) => [
          r.student_id,
          { status: 'present', note: draft[r.student_id]?.note || '' },
        ]),
      ),
    );
  const save = async () => {
    if (!classId) {
      toast('ابتدا کلاس آموزشی را انتخاب کنید.', 'error');
      return;
    }
    setBusy(true);
    try {
      const records = changed.map((r) => ({ student_id: r.student_id, ...draft[r.student_id] }));
      if (records.some((r) => !r.status))
        throw new Error('برای تمام ردیف‌های تغییرکرده یک وضعیت انتخاب کنید.');
      if (can('attendance.bulk'))
        await api('/attendance', {
          method: 'POST',
          body: { class_id: Number(classId), date, records },
        });
      else
        for (const r of records)
          await api('/attendance', {
            method: 'POST',
            body: { class_id: Number(classId), date, records: [r] },
          });
      toast(`حضور و غیاب ${fa(records.length)} دانش‌آموز ذخیره شد.`);
      refresh();
      history.refresh();
    } catch (e) {
      toast(e.message, 'error');
      refresh();
    } finally {
      setBusy(false);
    }
  };
  const exportFile = async () => {
    setExporting(true);
    try {
      await download(
        `/attendance/export?${query({ class_id: classId, date })}`,
        `attendance-${date}.csv`,
      );
      toast('گزارش حضور و غیاب دانلود شد.');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setExporting(false);
    }
  };
  if (!can('attendance.view'))
    return (
      <Empty
        title="حضور و غیاب غیرفعال است"
        description="مدیر می‌تواند این قابلیت را از بخش ماژول‌ها فعال کند."
        icon="CalendarCheck2"
      />
    );
  return (
    <div className={`attendance-page page-enter ${tab === 'leaves' ? 'show-leaves' : ''}`}>
      <div className="tabs">
        <button className={tab === 'roll' ? 'active' : ''} onClick={() => setParams({})}>
          <Icon name="CalendarCheck2" size={17} />
          دفتر حضور و غیاب
        </button>
        {can('leaves.view') && (
          <button
            className={tab === 'leaves' ? 'active' : ''}
            onClick={() => setParams({ tab: 'leaves' })}
          >
            <Icon name="PlaneTakeoff" size={17} />
            مرخصی و غیبت موجه
          </button>
        )}
      </div>
      <PageHeader
        title="حضور و غیاب"
        description={
          editable
            ? 'هر حضور، یک قدم در مسیر یادگیری. وضعیت کلاس را ثبت کنید.'
            : 'وضعیت حضور و غیاب خود را پیگیری کنید و در صورت نیاز تیکت بفرستید.'
        }
      >
        {can('attendance.export') && (
          <Button variant="secondary" icon="Download" loading={exporting} onClick={exportFile}>
            دریافت گزارش
          </Button>
        )}
        {editable && (
          <Button
            icon="Check"
            loading={busy}
            disabled={!changed.length || loading || !classId}
            onClick={save}
          >
            ذخیره تغییرات
            {changed.length > 0 && <span className="button-count">{fa(changed.length)}</span>}
          </Button>
        )}
      </PageHeader>
      {tab === 'roll' ? (
        <>
          <div className="attendance-controls panel">
            <div className="control-field">
              <label>کلاس آموزشی</label>
              <select
                value={classId}
                aria-label="انتخاب کلاس"
                onChange={(e) => changeScope(() => setClassId(e.target.value))}
              >
                {lookups.classes?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
                {!lookups.classes?.length && <option value="">کلاسی اختصاص داده نشده</option>}
              </select>
            </div>
            <div className="control-field">
              <label>تاریخ حضور و غیاب</label>
              <div className="date-picker">
                <Icon name="CalendarDays" size={18} />
                <span>
                  {dateFa(date, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
                <input
                  type="date"
                  aria-label="تاریخ حضور و غیاب"
                  value={date}
                  max={today()}
                  onChange={(e) => e.target.value && changeScope(() => setDate(e.target.value))}
                />
              </div>
            </div>
            <span className="attendance-day-note">
              <Icon name="Info" size={17} />
              {changed.length
                ? 'تغییرات هنوز ذخیره نشده‌اند'
                : data?.rows.length
                  ? `${fa(data.rows.length)} دانش‌آموز در این کلاس`
                  : 'کلاس مورد نظر را انتخاب کنید'}
            </span>
            {editable && can('attendance.bulk') && (
              <Button
                variant="soft"
                icon="CheckCheck"
                onClick={markAll}
                disabled={!data?.rows.length || loading}
              >
                همه حاضر
              </Button>
            )}
          </div>
          <div className="attendance-summary">
            {statuses.map(([key, label, icon, color]) => (
              <div className="attendance-summary-card" key={key}>
                <span className={`stat-icon tone-${color}`}>
                  <Icon name={icon} size={22} />
                </span>
                <div>
                  <strong>
                    {fa(summary[key])}
                    <small>نفر</small>
                  </strong>
                  <span>{label}</span>
                </div>
                <div className={`summary-line line-${color}`} />
              </div>
            ))}
          </div>
          <section className="panel">
            <div className="resource-toolbar">
              <div className="resource-toolbar-title">
                <h2>فهرست حضور کلاس</h2>
                <Badge>
                  {lookups.classes?.find((c) => c.id === Number(classId))?.label || 'کلاس شما'}
                </Badge>
              </div>
              <div className="resource-toolbar-controls">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="جست‌وجوی دانش‌آموز..."
                />
                {changed.length > 0 && (
                  <Button
                    variant="ghost"
                    icon="RefreshCw"
                    onClick={() =>
                      setDraft(
                        Object.fromEntries(
                          data.rows.map((r) => [
                            r.student_id,
                            { status: r.status || '', note: r.note || '' },
                          ]),
                        ),
                      )
                    }
                  >
                    بازگردانی
                  </Button>
                )}
              </div>
            </div>
            {error ? (
              <div className="panel-padding">
                <ErrorBox error={error} onRetry={refresh} />
              </div>
            ) : loading ? (
              <Loading rows={7} />
            ) : rows.length ? (
              <div className="table-scroll">
                <table className="data-table attendance-table">
                  <thead>
                    <tr>
                      <th>دانش‌آموز</th>
                      {editable && <th>تماس ولی</th>}
                      <th>وضعیت حضور</th>
                      <th>یادداشت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.student_id}
                        className={
                          changed.some((c) => c.student_id === r.student_id) ? 'edited-row' : ''
                        }
                      >
                        <td>
                          <div className="person-cell">
                            <Avatar
                              name={`${r.first_name} ${r.last_name}`}
                              id={r.student_id}
                              size="sm"
                            />
                            <span>
                              <strong>
                                {r.first_name} {r.last_name}
                              </strong>
                              <small>{r.class_name}</small>
                            </span>
                          </div>
                        </td>
                        {editable && (
                          <td dir="ltr" className="ltr-value">
                            {r.guardian_phone}
                          </td>
                        )}
                        <td>
                          {editable ? (
                            <div className="attendance-status-options">
                              {statuses.map(([status, label, icon, color]) => (
                                <button
                                  key={status}
                                  type="button"
                                  aria-pressed={draft[r.student_id]?.status === status}
                                  className={`status-option ${draft[r.student_id]?.status === status ? `selected tone-${color}` : ''}`}
                                  onClick={() =>
                                    setDraft((d) => ({
                                      ...d,
                                      [r.student_id]: { ...d[r.student_id], status },
                                    }))
                                  }
                                  disabled={busy}
                                >
                                  <Icon name={icon} size={15} />
                                  {label}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <Badge tone={statusTone(r.status)} dot>
                              {labelMap[r.status] || 'ثبت‌نشده'}
                            </Badge>
                          )}
                        </td>
                        <td>
                          {editable ? (
                            <input
                              className="attendance-note-input"
                              aria-label={`یادداشت ${r.first_name}`}
                              value={draft[r.student_id]?.note || ''}
                              placeholder="افزودن یادداشت..."
                              maxLength={500}
                              disabled={busy}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  [r.student_id]: { ...d[r.student_id], note: e.target.value },
                                }))
                              }
                            />
                          ) : (
                            r.note || '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="دانش‌آموزی برای نمایش نیست"
                description="کلاس را انتخاب کنید یا دانش‌آموز به آن اختصاص دهید."
                icon="UsersRound"
              />
            )}
            {editable && data?.rows.length > 0 && (
              <div className="attendance-table-footer">
                <span>
                  <Icon name="ShieldCheck" size={16} />
                  غیبت‌ها در اعلان دانش‌آموز و ولی دارای حساب ثبت می‌شوند.
                </span>
                <span>{dateFa(date)}</span>
              </div>
            )}
          </section>
          {editable && changed.length > 0 && (
            <div className="mobile-save-bar" role="status">
              <span>
                <Icon name="Info" size={16} />
                {fa(changed.length)} تغییر ذخیره‌نشده
              </span>
              <Button icon="Save" loading={busy} onClick={save}>
                ذخیره تغییرات
              </Button>
            </div>
          )}
          {history.data && (
            <section className="panel history-panel">
              <div className="panel-heading">
                <h2>تاریخچه حضور من</h2>
                <Badge tone="purple">{fa(history.data.length)} روز ثبت‌شده</Badge>
              </div>
              <div className="history-calendar">
                {history.data.slice(0, 24).map((a) => (
                  <div className={`history-day tone-${statusTone(a.status)}`} key={a.id}>
                    <span>{dateFa(a.date, { weekday: 'short' })}</span>
                    <strong>{dateFa(a.date, { day: 'numeric', month: 'short' })}</strong>
                    <small>{labelMap[a.status]}</small>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : null}
      {tab === 'leaves' && <LeavesPanel />}
      {pending && (
        <Confirm
          title="تغییرات ذخیره نشده"
          description="با تغییر کلاس یا تاریخ، تغییرات ذخیره‌نشده کنار گذاشته می‌شوند. ادامه می‌دهید؟"
          confirmLabel="بله، ادامه"
          onConfirm={async () => pending()}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  );
}
