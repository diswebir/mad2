import { featureDefs } from '../../shared/catalog';
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp, useApi } from '../context';
import { dateFa, fa, today, relativeDate, download, labelMap } from '../lib/api';
import {
  Avatar,
  Badge,
  Button,
  Empty,
  ErrorBox,
  Icon,
  IconButton,
  Loading,
  PageHeader,
  SchoolIllustration,
  statusTone,
} from '../components/ui';
import AttendanceChart from '../components/AttendanceChart';
function MyDay() {
  const { can } = useApp();
  const { data, loading, error, refresh } = useApi(
    can('dashboard.view') ? '/analysis/my-day' : null,
  );
  if (error) return <ErrorBox error={error} onRetry={refresh} />;
  if (loading && !data) return <Loading rows={2} />;
  if (!data) return null;
  const missing = data.classes.filter((row) => row.missing);
  const tasks = data.admin || data.teacher;
  return (
    <section className="panel my-day-panel">
      <div className="panel-heading">
        <div>
          <h2>کارهای امروز من</h2>
          <p className="muted small-text">{dateFa(data.date)} · نگاهی سریع به کارهای باقی‌مانده</p>
        </div>
        <Badge tone={missing.length ? 'orange' : 'green'} dot>
          {missing.length ? `${fa(missing.length)} کلاس بدون ثبت حضور` : 'حضور همه کلاس‌ها ثبت شده'}
        </Badge>
      </div>
      <div className="my-day-grid">
        {tasks && (
          <>
            {typeof tasks.missing_attendance === 'number' && (
              <div className={`my-day-card ${tasks.missing_attendance ? 'warn' : ''}`}>
                <Icon name="CalendarCheck2" size={22} />
                <strong>{fa(tasks.missing_attendance)}</strong>
                <span>کلاس بدون ثبت حضور امروز</span>
              </div>
            )}
            {typeof tasks.pending_leaves === 'number' && (
              <div className={`my-day-card ${tasks.pending_leaves ? 'warn' : ''}`}>
                <Icon name="PlaneTakeoff" size={22} />
                <strong>{fa(tasks.pending_leaves)}</strong>
                <span>درخواست مرخصی در انتظار تأیید</span>
              </div>
            )}
            {typeof tasks.unpaid_invoices === 'number' && (
              <div className={`my-day-card ${tasks.unpaid_invoices ? 'warn' : ''}`}>
                <Icon name="Wallet" size={22} />
                <strong>{fa(tasks.unpaid_invoices)}</strong>
                <span>صورتحساب سررسیدگذشته</span>
              </div>
            )}
            {typeof tasks.open_tickets === 'number' && (
              <div className="my-day-card">
                <Icon name="MessagesSquare" size={22} />
                <strong>{fa(tasks.open_tickets)}</strong>
                <span>تیکت باز</span>
              </div>
            )}
            {typeof tasks.new_error_reports === 'number' && (
              <div className={`my-day-card ${tasks.new_error_reports ? 'warn' : ''}`}>
                <Icon name="CircleHelp" size={22} />
                <strong>{fa(tasks.new_error_reports)}</strong>
                <span>گزارش خطای جدید</span>
              </div>
            )}
            {typeof tasks.unreviewed === 'number' && (
              <div className={`my-day-card ${tasks.unreviewed ? 'warn' : ''}`}>
                <Icon name="ClipboardList" size={22} />
                <strong>{fa(tasks.unreviewed)}</strong>
                <span>تمرین تصحیح‌نشده</span>
              </div>
            )}
          </>
        )}
        {typeof data.upcoming_meetings === 'number' && (
          <div className="my-day-card">
            <Icon name="CalendarClock" size={22} />
            <strong>{fa(data.upcoming_meetings)}</strong>
            <span>بازه ملاقات پیش‌رو</span>
          </div>
        )}
      </div>
      {missing.length > 0 && (
        <div className="my-day-list">
          <strong>کلاس‌هایی که امروز حضور ثبت نکرده‌اند:</strong>
          <div className="chip-row">
            {missing.map((row) => (
              <Link className="chip chip-orange" key={row.class_id} to="/attendance">
                {row.name} · {fa(row.students)} دانش‌آموز
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default function Dashboard() {
  const { user, config, can, toast } = useApp(),
    navigate = useNavigate();
  const [activitiesOpen, setActivitiesOpen] = useState(false);
  const [period, setPeriod] = useState('current'),
    [exporting, setExporting] = useState(false);
  const { data, loading, error, refresh } = useApi(
    can('dashboard.view') ? `/dashboard?period=${period}` : null,
  );
  if (!can('dashboard.view'))
    return (
      <Empty
        title="داشبورد غیرفعال است"
        description="از منوی سمت راست وارد بخش مورد نیاز شوید. مدیر می‌تواند داشبورد را در ماژول‌ها فعال کند."
        icon="LayoutDashboard"
      />
    );
  const exportReport = async () => {
    setExporting(true);
    try {
      await download('/reports/export', `school-report-${today()}.csv`);
      toast('گزارش مدرسه دانلود شد.');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setExporting(false);
    }
  };
  if (error) return <ErrorBox error={error} onRetry={refresh} />;
  const stats = data?.stats;
  const isMember = ['student', 'parent'].includes(user.role);
  const greeting =
    user.role === 'admin'
      ? `سلام، ${user.full_name.split(' ')[0]} عزیز`
      : `سلام، ${user.full_name.split(' ')[0]} عزیز`;
  const gradeCount = new Set(data?.classes.map((c) => c.grade)).size;
  return (
    <div className="dashboard-page page-enter">
      <PageHeader title="داشبورد مدرسه" description="همه‌چیز برای یک روز منظم و پربار، در یک نگاه.">
        <span className="date-pill">
          <Icon name="CalendarDays" size={17} />
          {dateFa(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
        {can('reports.export') && (
          <Button variant="secondary" icon="Download" loading={exporting} onClick={exportReport}>
            دریافت گزارش
          </Button>
        )}
      </PageHeader>
      <section className="welcome-banner">
        <div className="welcome-copy">
          <span className="welcome-eyebrow">
            <span />
            شروع یک روز خوب
          </span>
          <h2>
            {greeting}
            <span className="wave">✦</span>
          </h2>
          <p>
            {isMember
              ? 'یادگیری، پیگیری و ارتباط با مدرسه؛ همه در پنل شما.'
              : 'با هم، مسیر یادگیری را هموارتر می‌کنیم.'}
          </p>
          <div className="welcome-bottom">
            {can('students.view') && (
              <Button
                icon={isMember ? 'FolderOpen' : 'UserPlus'}
                onClick={() =>
                  navigate(
                    isMember
                      ? `/students?id=${user.student_id}`
                      : can('students.create') && user.role === 'admin'
                        ? '/students?new=1'
                        : '/students',
                  )
                }
              >
                {isMember
                  ? 'مشاهده پرونده من'
                  : can('students.create') && user.role === 'admin'
                    ? 'افزودن دانش‌آموز'
                    : 'مشاهده دانش‌آموزان'}
                <Icon name="ArrowUpLeft" size={17} />
              </Button>
            )}
            {can('tickets.view') && (
              <span className="welcome-ticket">
                <span className="welcome-ticket-dot" />
                {data
                  ? `${fa(data.open_tickets)} تیکت در انتظار بررسی`
                  : 'ارتباطی نزدیک‌تر با مدرسه'}
              </span>
            )}
          </div>
        </div>
        <SchoolIllustration className="welcome-illustration" />
        <div className="welcome-decoration" />
      </section>
      <MyDay />
      {loading && !data ? (
        <Loading rows={4} />
      ) : (
        stats && (
          <section className="stat-grid">
            {[
              {
                icon: 'GraduationCap',
                color: 'purple',
                title: isMember
                  ? 'پرونده دانش‌آموز'
                  : user.role === 'teacher'
                    ? 'دانش‌آموزان کلاس‌های من'
                    : 'کل دانش‌آموزان',
                value: stats.students ?? '—',
                unit: 'نفر',
                bottom: isMember ? 'اطلاعات تحصیلی و فردی' : 'دانش‌آموزان مدرسه',
                note: 'پرونده‌های منظم',
                tone: 'purple',
                path: '/students',
              },
              {
                icon: 'UsersRound',
                color: 'blue',
                title: user.role === 'teacher' ? 'پرونده معلم' : 'معلمان',
                value: stats.teachers ?? '—',
                unit: 'نفر',
                bottom: 'همراهان مسیر یادگیری',
                note: 'کادر آموزشی',
                tone: 'blue',
                path: user.role === 'admin' || user.role === 'teacher' ? '/teachers' : '/classes',
              },
              {
                icon: 'School',
                color: 'orange',
                title: user.role === 'teacher' ? 'کلاس‌های من' : 'کلاس‌های فعال',
                value: stats.classes ?? '—',
                unit: 'کلاس',
                bottom: `در ${fa(gradeCount)} پایه تحصیلی`,
                note: 'سال جاری',
                tone: 'orange',
                path: '/classes',
              },
              {
                icon: 'CalendarCheck2',
                color: 'green',
                title: 'حضور امروز',
                value: stats.attendance_rate ?? '—',
                unit: '٪',
                bottom: `${fa(stats.present)} دانش‌آموز حاضر`,
                note: `${fa(stats.absent)} غایب`,
                tone: stats.absent ? 'orange' : 'green',
                path: '/attendance',
              },
            ].map((item) => (
              <button
                className="stat-card"
                key={item.title}
                disabled={!can(`${item.path.slice(1)}.view`)}
                onClick={() => navigate(item.path)}
              >
                <div className="stat-top">
                  <span>{item.title}</span>
                  <div className={`stat-icon tone-${item.color}`}>
                    <Icon name={item.icon} size={23} />
                  </div>
                </div>
                <div className="stat-value">
                  {fa(item.value)}
                  <small>{item.unit}</small>
                </div>
                <div className="stat-bottom">
                  <span>{item.bottom}</span>
                  <Badge tone={item.tone}>{item.note}</Badge>
                </div>
              </button>
            ))}
          </section>
        )
      )}
      {(can('dashboard.chart') || can('announcements.view')) && (
        <div
          className={`dashboard-middle ${can('dashboard.chart') && can('announcements.view') ? '' : 'dashboard-one-panel'}`}
        >
          {can('dashboard.chart') && (
            <section className="panel attendance-panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    <span className="heading-marker" />
                    روند حضور دانش‌آموزان
                  </h2>
                  <p>نگاهی به نظم و همراهی در کلاس‌ها</p>
                </div>
                <select
                  className="select select-sm"
                  aria-label="بازه نمودار حضور"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                >
                  <option value="current">این هفته</option>
                  <option value="previous">هفته گذشته</option>
                </select>
              </div>
              {loading && !data ? (
                <Loading rows={2} />
              ) : (
                <AttendanceChart data={data?.chart || []} />
              )}
              <div className="chart-footer">
                <Icon name="Info" size={14} />
                <span>آمار بر اساس حضور و غیاب ثبت‌شده است.</span>
                {can('attendance.view') && (
                  <Link to="/attendance">
                    ثبت حضور و غیاب
                    <Icon name="ArrowUpLeft" size={14} />
                  </Link>
                )}
              </div>
            </section>
          )}
          {can('announcements.view') && (
            <section className="panel announcements-panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    <span className="heading-marker orange" />
                    اطلاعیه‌های مدرسه
                  </h2>
                  <p>در جریان تازه‌ترین خبرها باشید</p>
                </div>
                <Link className="text-link" to="/announcements">
                  همه
                  <Icon name="ChevronLeft" size={15} />
                </Link>
              </div>
              <div className="announcement-list">
                {data?.announcements.length ? (
                  data.announcements.map((a, i) => (
                    <button
                      className="announcement-preview"
                      key={a.id}
                      onClick={() => navigate(`/announcements?id=${a.id}`)}
                    >
                      <span
                        className={`announcement-icon tone-${['purple', 'orange', 'blue'][i % 3]}`}
                      >
                        <Icon name={['UsersRound', 'Sparkles', 'Megaphone'][i % 3]} size={19} />
                      </span>
                      <div>
                        <div className="announcement-title">
                          <h3>{a.title}</h3>
                          <span>{relativeDate(a.publish_date)}</span>
                        </div>
                        <p>{a.body}</p>
                        <small>
                          {a.audience === 'all'
                            ? 'همه اعضای مدرسه'
                            : a.audience === 'teacher'
                              ? 'معلمان'
                              : a.audience === 'parent'
                                ? 'اولیا'
                                : 'دانش‌آموزان'}
                          <Icon name="ChevronLeft" size={12} />
                        </small>
                      </div>
                    </button>
                  ))
                ) : (
                  <Empty
                    title="خبر جدیدی ندارید"
                    description="اطلاعیه‌های مرتبط با شما اینجا نمایش داده می‌شود."
                    icon="Megaphone"
                  />
                )}
              </div>
            </section>
          )}
        </div>
      )}
      {(can('students.view') || can('events.view')) && (
        <div
          className={`dashboard-bottom ${can('students.view') && can('events.view') ? '' : 'dashboard-one-panel'}`}
        >
          {can('students.view') && (
            <section className="panel students-panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    <span className="heading-marker blue" />
                    {isMember ? 'وضعیت دانش‌آموز' : 'دانش‌آموزان مدرسه'}
                    <Badge>{fa(stats?.students)}</Badge>
                  </h2>
                  <p>پرونده‌های تحصیلی، همیشه در دسترس</p>
                </div>
                <Link className="text-link" to="/students">
                  مشاهده همه
                  <Icon name="ChevronLeft" size={15} />
                </Link>
              </div>
              <div className="table-scroll">
                <table className="data-table dashboard-student-table">
                  <thead>
                    <tr>
                      <th>دانش‌آموز</th>
                      <th>کلاس</th>
                      <th>حضور امروز</th>
                      <th aria-label="عملیات" />
                    </tr>
                  </thead>
                  <tbody>
                    {data?.students.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <button
                            className="person-cell"
                            onClick={() => navigate(`/students?id=${s.id}`)}
                          >
                            <Avatar name={`${s.first_name} ${s.last_name}`} id={s.id} size="sm" />
                            <span>
                              <strong>
                                {s.first_name} {s.last_name}
                              </strong>
                              <small>کد دانش‌آموزی: {fa(String(s.id).padStart(4, '0'))}</small>
                            </span>
                          </button>
                        </td>
                        <td>
                          <span className="class-pill">{s.class_name}</span>
                        </td>
                        <td>
                          <Badge tone={statusTone(s.attendance_status)} dot>
                            {labelMap[s.attendance_status] || 'ثبت‌نشده'}
                          </Badge>
                        </td>
                        <td>
                          <IconButton
                            name="ArrowUpLeft"
                            label={`پرونده ${s.first_name}`}
                            onClick={() => navigate(`/students?id=${s.id}`)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data?.students.length && !loading && (
                  <Empty
                    title="پرونده‌ای برای نمایش وجود ندارد"
                    description="با افزودن دانش‌آموز، پرونده‌ها اینجا نمایش داده می‌شوند."
                    icon="GraduationCap"
                  />
                )}
              </div>
            </section>
          )}
          {can('events.view') && (
            <section className="panel events-panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    <span className="heading-marker green" />
                    رویدادهای پیش رو
                  </h2>
                  <p>برای روزهای آینده آماده باشیم</p>
                </div>
                <span className="small-icon tone-green">
                  <Icon name="CalendarDays" size={19} />
                </span>
              </div>
              <div className="event-list">
                {data?.events.map((event, i) => (
                  <button
                    className="event-preview"
                    key={event.id}
                    onClick={() => navigate(`/calendar?id=${event.id}`)}
                  >
                    <div
                      className={`event-date tone-${['purple', 'orange', 'blue', 'green'][i % 4]}`}
                    >
                      <strong>{dateFa(event.start_date, { day: 'numeric' })}</strong>
                      <span>{dateFa(event.start_date, { month: 'short' })}</span>
                    </div>
                    <div>
                      <h3>{event.title}</h3>
                      <p>
                        <Icon name="Clock3" size={13} />
                        {event.start_time
                          ? event.start_time.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])
                          : 'تمام روز'}
                        <span>·</span>
                        {event.location}
                      </p>
                    </div>
                    <Icon name="ChevronLeft" size={15} />
                  </button>
                ))}
                {!data?.events.length && !loading && (
                  <Empty
                    title="رویدادی نزدیک نیست"
                    description="تقویم مدرسه را برای برنامه‌های بعدی ببینید."
                    icon="CalendarDays"
                  />
                )}
              </div>
              <Link className="panel-bottom-link" to="/calendar">
                مشاهده تقویم مدرسه
                <Icon name="ArrowUpLeft" size={16} />
              </Link>
            </section>
          )}
        </div>
      )}
      {can('dashboard.activities') && (
        <section className="panel dashboard-activities">
          <div className="panel-heading">
            <div>
              <h2>
                <span className="heading-marker" />
                فعالیت‌های اخیر <Badge>{fa(data?.activities?.length || 0)}</Badge>
              </h2>
              <p>رویدادهای مرتبط با حساب و بخش‌های مجاز شما</p>
            </div>
            <Button
              variant="ghost"
              icon={activitiesOpen ? 'ChevronUp' : 'ChevronDown'}
              aria-expanded={activitiesOpen}
              aria-controls="dashboard-activity-list"
              onClick={() => setActivitiesOpen((v) => !v)}
            >
              {activitiesOpen ? 'بستن رویدادها' : 'مشاهده رویدادها'}
            </Button>
          </div>
          {activitiesOpen && (
            <div id="dashboard-activity-list" className="dashboard-activity-list">
              {data?.activities?.length ? (
                data.activities.map((a) => (
                  <div className="dashboard-activity-row" key={a.id}>
                    <span className="small-icon tone-purple">
                      <Icon name="ClipboardList" size={18} />
                    </span>
                    <div>
                      <strong>
                        {featureDefs.find((f) => f.id === a.action)?.name ||
                          {
                            'install.demo': 'آماده‌سازی داده‌های نمونه',
                            'install.complete': 'راه‌اندازی مدرسه',
                            'auth.password': 'تغییر رمز ورود',
                            'auth.profile': 'به‌روزرسانی حساب',
                            'settings.module': 'تنظیم ماژول',
                            'settings.feature': 'تنظیم قابلیت',
                          }[a.action] ||
                          'به‌روزرسانی اطلاعات'}
                      </strong>
                      <p>
                        {a.user_name || 'سامانه مدرسه‌یار'}
                        {a.entity_id ? ` · رکورد ${fa(a.entity_id)}` : ''}
                      </p>
                    </div>
                    <time>{dateFa(a.created_at)}</time>
                  </div>
                ))
              ) : (
                <p className="activity-empty">
                  رویدادهای شما پس از اولین عملیات اینجا نمایش داده می‌شوند.
                </p>
              )}
            </div>
          )}
        </section>
      )}
      <div className="dashboard-note">
        <Icon name="ShieldCheck" size={17} />
        <span>اطلاعات شما امن است؛ هر کاربر فقط به بخش‌های مجاز دسترسی دارد.</span>
        <span className="demo-note">
          {config.feature_count ? `${fa(config.feature_count)} قابلیت، یک تجربه یکپارچه` : ''}
          <Icon name="Sparkles" size={15} />
        </span>
      </div>
    </div>
  );
}
