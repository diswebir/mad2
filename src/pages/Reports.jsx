import React, { useState } from 'react';
import { useApp, useApi } from '../context';
import { download, fa, money, today } from '../lib/api';
import { Badge, Button, Empty, ErrorBox, Icon, Loading, PageHeader } from '../components/ui';
import AttendanceChart from '../components/AttendanceChart';
export default function Reports() {
  const { can, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const { data, loading, error, refresh } = useApi(can('reports.view') ? '/reports' : null);
  const exportFile = async () => {
    setBusy(true);
    try {
      await download('/reports/export', `analytics-${today()}.csv`);
      toast('گزارش قابل استفاده در اکسل دانلود شد.');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  if (!can('reports.view'))
    return <Empty title="گزارش‌ها غیرفعال هستند" icon="ChartNoAxesCombined" />;
  return (
    <div className="reports-page page-enter">
      <PageHeader
        title="از داده، به تصمیم بهتر"
        description="تصویری شفاف از آموزش، حضور و وضعیت مالی مدرسه."
      >
        <span className="date-pill">
          <Icon name="CalendarDays" size={17} />
          حضور: ۳۰ روز اخیر
        </span>
        {can('reports.export') && (
          <Button icon="Download" loading={busy} onClick={exportFile}>
            دانلود گزارش
          </Button>
        )}
      </PageHeader>
      {error ? (
        <ErrorBox error={error} onRetry={refresh} />
      ) : loading && !data ? (
        <Loading rows={7} />
      ) : (
        data && (
          <>
            <div className="report-stat-grid">
              {[
                [
                  'GraduationCap',
                  'purple',
                  'دانش‌آموزان',
                  fa(data.students),
                  'پرونده‌های مجاز برای حساب شما',
                ],
                ['Award', 'blue', 'معدل وزنی', fa(data.average), 'میانگین نمرات ثبت‌شده از ۲۰'],
                [
                  'ClipboardList',
                  'orange',
                  'ارزشیابی ثبت‌شده',
                  fa(data.grade_count),
                  'نمره با ضریب آموزشی',
                ],
                ['School', 'green', 'کلاس‌ها', fa(data.classes.length), 'کلاس‌های تحت پوشش'],
              ].map(([icon, color, label, value, note]) => (
                <div className="report-stat" key={label}>
                  <span className={`stat-icon tone-${color}`}>
                    <Icon name={icon} size={25} />
                  </span>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <small>{note}</small>
                </div>
              ))}
            </div>
            <div className="reports-main-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>روند حضور در هفته جاری</h2>
                    <p>حضور و تأخیر در برابر غیبت ثبت‌شده</p>
                  </div>
                  <Badge tone="green">آمار زنده</Badge>
                </div>
                <AttendanceChart data={data.chart} />
              </section>
              <section className="panel achievement-panel">
                <div className="panel-heading">
                  <h2>نگاهی به یادگیری</h2>
                  <span className="small-icon tone-purple">
                    <Icon name="Target" />
                  </span>
                </div>
                <div
                  className="score-donut"
                  style={{ '--score': `${Math.min(100, (data.average / 20) * 100)}%` }}
                >
                  <div>
                    <strong>{fa(data.average)}</strong>
                    <span>از ۲۰ نمره</span>
                  </div>
                </div>
                <h3>
                  {data.average >= 17
                    ? 'مسیر یادگیری، روشن است'
                    : data.average >= 14
                      ? 'فرصت رشد و پیشرفت'
                      : 'نیاز به همراهی بیشتر'}
                </h3>
                <p>
                  معدل وزنی از تمام ارزشیابی‌های قابل دسترسی برای این حساب محاسبه شده است؛ کارنامه
                  رسمی نهایی نیست.
                </p>
              </section>
            </div>
            <section className="panel class-report-panel">
              <div className="panel-heading">
                <div>
                  <h2>گزارش کلاس‌ها</h2>
                  <p>میانگین آموزشی و نظم حضور، در کنار هم</p>
                </div>
                <Badge tone="purple">{fa(data.classes.length)} کلاس</Badge>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>کلاس</th>
                      <th>معلم راهنما</th>
                      <th>دانش‌آموز</th>
                      <th>میانگین از ۲۰</th>
                      <th>حضور ۳۰ روز</th>
                      <th>وضعیت آموزشی</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.classes.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <span className="class-pill">{c.name}</span>
                        </td>
                        <td>{c.teacher}</td>
                        <td>{fa(c.students)} نفر</td>
                        <td>
                          <strong className="grade-value good">{fa(c.average)}</strong>
                        </td>
                        <td>
                          <div className="report-progress">
                            <div>
                              <span style={{ width: `${c.attendance}%` }} />
                            </div>
                            <span>{fa(c.attendance)}٪</span>
                          </div>
                        </td>
                        <td>
                          <Badge
                            tone={c.average >= 17 ? 'green' : c.average >= 14 ? 'orange' : 'red'}
                            dot
                          >
                            {c.average >= 17
                              ? 'مطلوب'
                              : c.average >= 14
                                ? 'در حال رشد'
                                : 'نیازمند پیگیری'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.classes.length && <Empty title="کلاسی برای گزارش نیست" />}
              </div>
            </section>
            {data.finance && (
              <section className="finance-report">
                <div className="finance-report-heading">
                  <span className="small-icon tone-purple">
                    <Icon name="Wallet" />
                  </span>
                  <div>
                    <h2>شفافیت مالی</h2>
                    <p>جمع صورتحساب‌های قابل دسترسی برای این حساب</p>
                  </div>
                </div>
                <div className="finance-report-grid">
                  <div>
                    <span>صورتحساب صادرشده</span>
                    <strong>{money(data.finance.billed)}</strong>
                    <small>{fa(data.finance.invoices)} صورتحساب</small>
                  </div>
                  <div>
                    <span>وصول‌شده</span>
                    <strong className="green-text">{money(data.finance.collected)}</strong>
                    <small>رسیدهای ثبت‌شده</small>
                  </div>
                  <div>
                    <span>مانده مطالبات</span>
                    <strong className="purple-text">{money(data.finance.remaining)}</strong>
                    <small>تسویه‌نشده</small>
                  </div>
                </div>
              </section>
            )}
          </>
        )
      )}
    </div>
  );
}
