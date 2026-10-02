import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, dateFa, describeError, download, fa, query, today } from '../lib/api';
import { useApi, useApp } from '../context';
import { Badge, Button, Empty, ErrorBox, Icon, Loading, statusTone, SearchSelect } from './ui';

export function ReportCardPanel() {
  const { can, lookups, toast } = useApp();
  const [classId, setClassId] = useState('');
  const { data, loading, error, refresh } = useApi(
    classId ? `/analysis/report-cards?${query({ class_id: classId })}` : null,
  );
  const exportWorkbook = async () => {
    try {
      await download(
        `/analysis/ministerial?type=grades&format=xlsx`,
        `ministerial-grades-${today()}.xlsx`,
      );
      toast('خروجی نمرات آماده شد.');
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  if (!can('reports.report_card'))
    return <Empty title="کارنامه برای نقش شما فعال نیست" icon="Award" />;
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>کارنامه پایان دوره</h2>
          <p className="muted small-text">
            کارنامه هر دانش‌آموز را ببینید، چاپ کنید یا برای بایگانی خروجی بگیرید.
          </p>
        </div>
        <div className="panel-actions">
          <SearchSelect
            ariaLabel="انتخاب کلاس"
            value={classId}
            onChange={setClassId}
            placeholder="جست‌وجو یا انتخاب کلاس..."
            options={(lookups.classes || []).map((c) => ({ value: c.id, label: c.label }))}
          />
          {classId && (
            <>
              <Link className="btn btn-primary" to={`/print/cards/${classId}`}>
                <Icon name="FileText" size={17} />
                چاپ کارنامه‌های کلاس
              </Link>
              <Button variant="secondary" icon="Download" onClick={exportWorkbook}>
                خروجی نمرات (XLSX)
              </Button>
            </>
          )}
        </div>
      </div>
      {error ? (
        <div className="panel-padding">
          <ErrorBox error={error} onRetry={refresh} />
        </div>
      ) : !classId ? (
        <Empty title="یک کلاس انتخاب کنید" icon="Award" />
      ) : loading || !data ? (
        <Loading rows={5} />
      ) : (
        <>
          <div className="report-stat-grid">
            <div className="report-stat">
              <Icon name="ChartNoAxesCombined" size={22} />
              <strong>{data.class_average === null ? '—' : fa(data.class_average)}</strong>
              <span>معدل کلاس</span>
            </div>
            <div className="report-stat">
              <Icon name="UsersRound" size={22} />
              <strong>{fa(data.rows.length)}</strong>
              <span>دانش‌آموز</span>
            </div>
            <div className="report-stat">
              <Icon name="CalendarRange" size={22} />
              <strong>{data.term || '—'}</strong>
              <span>دوره</span>
            </div>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>دانش‌آموز</th>
                  <th>معدل</th>
                  <th>درصد حضور</th>
                  <th>تعداد درس</th>
                  <th className="actions-column">کارنامه</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.average === null ? '—' : fa(row.average)}</td>
                    <td>{row.attendance_rate === null ? '—' : `${fa(row.attendance_rate)}٪`}</td>
                    <td>{fa(row.subject_count)}</td>
                    <td>
                      <Link
                        className="btn btn-ghost"
                        to={`/print/cards/${classId}?student=${row.id}`}
                      >
                        <Icon name="FileText" size={16} /> چاپ
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export function TrendPanel() {
  const { lookups, can } = useApp();
  const [studentId, setStudentId] = useState('');
  const { data, loading, error, refresh } = useApi(
    studentId && can('reports.trend') ? `/analysis/trend/${studentId}` : null,
  );
  if (!can('reports.trend'))
    return <Empty title="تحلیل روند برای نقش شما فعال نیست" icon="ChartNoAxesCombined" />;
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>روند تحصیلی دانش‌آموز</h2>
          <p className="muted small-text">تغییر معدل و حضور در ماه‌های گذشته.</p>
        </div>
        <SearchSelect
          ariaLabel="انتخاب دانش‌آموز"
          value={studentId}
          onChange={setStudentId}
          placeholder="نام دانش‌آموز را جست‌وجو کنید..."
          options={(lookups.students || []).map((s) => ({ value: s.id, label: s.label }))}
        />
      </div>
      {error ? (
        <div className="panel-padding">
          <ErrorBox error={error} onRetry={refresh} />
        </div>
      ) : !studentId ? (
        <Empty title="برای دیدن روند، دانش‌آموز را انتخاب کنید" icon="Target" />
      ) : loading || !data ? (
        <Loading rows={4} />
      ) : (
        <div className="trend-grid">
          <div className="trend-column">
            <h3>معدل ماهانه</h3>
            {data.trend.length ? (
              data.trend.map((point) => (
                <div className="trend-row" key={point.month}>
                  <span dir="ltr">{point.month}</span>
                  <div className="trend-bar">
                    <span style={{ width: `${Math.min(100, (point.average / 20) * 100)}%` }} />
                  </div>
                  <strong>{fa(point.average)}</strong>
                  <small>{fa(point.count)} نمره</small>
                </div>
              ))
            ) : (
              <p className="muted">نمره‌ای ثبت نشده است.</p>
            )}
          </div>
          <div className="trend-column">
            <h3>حضور ماهانه</h3>
            {data.attendance.length ? (
              data.attendance.map((point) => (
                <div className="trend-row" key={point.month}>
                  <span dir="ltr">{point.month}</span>
                  <div className="trend-bar tone-green">
                    <span style={{ width: `${Math.min(100, point.rate)}%` }} />
                  </div>
                  <strong>{fa(point.rate)}٪</strong>
                  <small>
                    {fa(point.present)} از {fa(point.total)}
                  </small>
                </div>
              ))
            ) : (
              <p className="muted">حضوری ثبت نشده است.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

const promotionActions = [
  ['promoted', 'ارتقا به پایه بعد'],
  ['repeated', 'تکرار پایه'],
  ['graduated', 'فارغ‌التحصیل'],
  ['transferred', 'انتقالی'],
];

export function PromotionPanel() {
  const { can, toast } = useApp();
  const { data, loading, error, refresh } = useApi(
    can('reports.promote') ? '/analysis/promotion/preview' : null,
  );
  const [busy, setBusy] = useState(false);
  const [error2, setError2] = useState(null);
  const [choices, setChoices] = useState({});
  const actionOf = (student) => choices[student.id] || student.suggested || 'promoted';
  const apply = async () => {
    const decisions = [];
    for (const cls of data.classes || [])
      for (const student of cls.roster || [])
        decisions.push({ student_id: student.id, action: actionOf(student) });
    if (!decisions.length) {
      toast('هیچ تصمیم ارتقایی برای ثبت وجود ندارد.', 'error');
      return;
    }
    setBusy(true);
    setError2(null);
    try {
      const result = await api('/analysis/promotion/apply', {
        method: 'POST',
        body: { term: data.active_year, decisions },
      });
      toast(
        `ثبت شد: ${fa(result.summary.promoted)} ارتقا، ${fa(result.summary.repeated)} تکرار پایه، ${fa(result.summary.graduated)} فارغ‌التحصیل.`,
      );
      refresh();
    } catch (e) {
      setError2(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  if (!can('reports.promote'))
    return <Empty title="ارتقا و بایگانی سال برای نقش شما فعال نیست" icon="History" />;
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>پایان سال و بایگانی کارنامه</h2>
          <p className="muted small-text">
            وضعیت پیشنهادی هر دانش‌آموز بر اساس معدل و حضور؛ پس از تأیید، کارنامه در آرشیو ثبت
            می‌شود.
          </p>
        </div>
        <Button icon="CircleArrowUp" loading={busy} onClick={apply} disabled={!data}>
          ثبت ارتقا سال {data?.active_year || ''}
        </Button>
      </div>
      {error ? (
        <div className="panel-padding">
          <ErrorBox error={error} onRetry={refresh} />
        </div>
      ) : loading || !data ? (
        <Loading rows={3} />
      ) : (
        <>
          {error2 && <ErrorBox error={error2} />}
          <p className="muted small-text">
            سال جاری {data.active_year} · سال بعد {data.next_year || '—'} · ارتقا به پایه{' '}
            {fa(data.grade_step)}
          </p>
          {data.classes.map((cls) => (
            <div className="promotion-class" key={cls.id}>
              <h3>
                {cls.name} <Badge tone="purple">{fa(cls.roster.length)} دانش‌آموز</Badge>
              </h3>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>دانش‌آموز</th>
                      <th>معدل</th>
                      <th>پیشنهاد سامانه</th>
                      <th>تصمیم نهایی</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cls.roster.map((student) => (
                      <tr key={student.id}>
                        <td>{`${student.first_name || ''} ${student.last_name || ''}`.trim()}</td>
                        <td>{student.average === null ? '—' : fa(student.average)}</td>
                        <td>
                          <Badge tone={student.suggested === 'promoted' ? 'green' : 'orange'} dot>
                            {student.suggested === 'promoted' ? 'ارتقا' : 'تکرار پایه'}
                          </Badge>
                        </td>
                        <td>
                          <select
                            aria-label={`تصمیم برای ${student.first_name || student.id}`}
                            value={actionOf(student)}
                            onChange={(e) =>
                              setChoices((c) => ({ ...c, [student.id]: e.target.value }))
                            }
                          >
                            {promotionActions.map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

export function ArchivePanel() {
  const { can } = useApp();
  const { data, loading, error, refresh } = useApi(
    can('student_years.view') ? '/analysis/student-years' : null,
  );
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>آرشیو کارنامه‌های سالانه</h2>
      </div>
      {error ? (
        <div className="panel-padding">
          <ErrorBox error={error} onRetry={refresh} />
        </div>
      ) : loading && !data ? (
        <Loading rows={3} />
      ) : data?.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>دانش‌آموز</th>
                <th>سال تحصیلی</th>
                <th>کلاس</th>
                <th>معدل</th>
                <th>حضور</th>
                <th>سرانجام</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id}>
                  <td>{`${row.first_name || ''} ${row.last_name || ''}`.trim()}</td>
                  <td>{row.term}</td>
                  <td>{row.class_name || '—'}</td>
                  <td>{row.average === null ? '—' : fa(row.average)}</td>
                  <td>{row.attendance_rate === null ? '—' : `${fa(row.attendance_rate)}٪`}</td>
                  <td>
                    <Badge tone={statusTone(row.status === 'promoted' ? 'active' : 'pending')} dot>
                      {row.status === 'promoted'
                        ? 'ارتقا یافت'
                        : row.status === 'repeated'
                          ? 'تکرار پایه'
                          : row.status === 'graduated'
                            ? 'فارغ‌التحصیل'
                            : row.status === 'transferred'
                              ? 'انتقالی'
                              : 'در حال تحصیل'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="آرشیوی ثبت نشده است"
          description="پس از اجرای ارتقای پایان سال، کارنامه‌ها اینجا نگهداری می‌شوند."
          icon="History"
        />
      )}
    </section>
  );
}

export function MinisterialPanel() {
  const { can, toast } = useApp();
  const [busy, setBusy] = useState(null);
  const grab = async (type, format) => {
    setBusy(`${type}-${format}`);
    try {
      await download(
        `/analysis/ministerial?type=${type}&format=${format}`,
        `ministerial-${type}-${today()}.${format}`,
      );
      toast('فایل خروجی وزارت آموزش و پرورش آماده شد.');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };
  if (!can('reports.ministerial'))
    return <Empty title="خروجی سناد/وزارت برای نقش شما فعال نیست" icon="Send" />;
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>خروجی سناد و وزارت آموزش و پرورش</h2>
          <p className="muted small-text">
            فایل‌های استاندارد شامل کد ملی، پایه، نمرات و آمار حضور برای بارگذاری در سامانه‌های
            بیرونی.
          </p>
        </div>
      </div>
      <div className="export-grid">
        {[
          ['students', 'csv', 'فهرست دانش‌آموزان (CSV)', 'FileText'],
          ['students', 'xlsx', 'فهرست دانش‌آموزان (XLSX)', 'FileText'],
          ['grades', 'csv', 'نمرات (CSV)', 'Award'],
          ['grades', 'xlsx', 'نمرات (XLSX)', 'Award'],
        ].map(([type, format, label, icon]) => (
          <button
            className="export-card"
            key={`${type}-${format}`}
            disabled={busy === `${type}-${format}`}
            onClick={() => grab(type, format)}
          >
            <Icon name={icon} size={24} />
            <strong>{label}</strong>
            <small>آماده برای بارگذاری در سامانه‌های بیرونی</small>
          </button>
        ))}
      </div>
      <p className="muted small-text">
        تاریخ تولید: {dateFa(today())} · قالب فایل‌ها UTF-8 با ستون‌های فارسی است.
      </p>
    </section>
  );
}
