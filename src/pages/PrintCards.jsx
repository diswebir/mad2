import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, dateFa, fa, query } from '../lib/api';
import { useApp } from '../context';
import { Button, Empty, ErrorBox, Icon, Loading } from '../components/ui';

const PERSIAN_DIGITS = (value) => String(value ?? '').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

function ReportCardSheet({ card }) {
  return (
    <article className="print-sheet report-card-sheet">
      <header className="print-sheet-head">
        <div>
          <h1>{card.school?.name || 'مدرسه'}</h1>
          <p>
            کارنامه تحصیلی · سال {card.term || '—'} · کلاس {card.student.class_name || '—'}
          </p>
        </div>
        <div className="print-sheet-code">
          <span>شناسه دانش‌آموز</span>
          <strong dir="ltr">{PERSIAN_DIGITS(card.student.national_id || card.student.id)}</strong>
        </div>
      </header>
      <dl className="print-meta">
        <div>
          <dt>نام و نام خانوادگی</dt>
          <dd>{card.student.name}</dd>
        </div>
        <div>
          <dt>پایه</dt>
          <dd>{PERSIAN_DIGITS(card.student.grade)}</dd>
        </div>
        <div>
          <dt>معلم راهنما</dt>
          <dd>{card.student.teacher_name || '—'}</dd>
        </div>
        <div>
          <dt>معدل کل</dt>
          <dd>{card.average === null ? '—' : PERSIAN_DIGITS(card.average)}</dd>
        </div>
      </dl>
      <table className="print-table">
        <thead>
          <tr>
            <th>درس</th>
            <th>ارزشیابی</th>
            <th>نمره</th>
            <th>ضریب</th>
          </tr>
        </thead>
        <tbody>
          {card.subjects.length ? (
            card.subjects.map((subject) => (
              <React.Fragment key={subject.subject_id || subject.subject}>
                {subject.items.map((item, index) => (
                  <tr key={`${subject.subject}-${index}`}>
                    {index === 0 && (
                      <td rowSpan={subject.items.length}>
                        {subject.subject}
                        <small>
                          میانگین {subject.average === null ? '—' : PERSIAN_DIGITS(subject.average)}
                        </small>
                      </td>
                    )}
                    <td>{item.title}</td>
                    <td>
                      {PERSIAN_DIGITS(item.score)} از {PERSIAN_DIGITS(item.max_score)}
                    </td>
                    <td>{PERSIAN_DIGITS(item.coefficient)}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))
          ) : (
            <tr>
              <td colSpan={4}>در این بازه نمره‌ای ثبت نشده است.</td>
            </tr>
          )}
        </tbody>
      </table>
      <ul className="print-summary">
        <li>
          روزهای حضور: <strong>{PERSIAN_DIGITS(card.attendance.present)}</strong> از{' '}
          {PERSIAN_DIGITS(card.attendance.total)} روز ثبت‌شده (
          {card.attendance.rate === null ? '—' : `${PERSIAN_DIGITS(card.attendance.rate)}٪`})
        </li>
        <li>
          غیبت: <strong>{PERSIAN_DIGITS(card.attendance.absent)}</strong> · موجه:{' '}
          {PERSIAN_DIGITS(card.attendance.excused)}
        </li>
      </ul>
      <footer className="print-signatures">
        <div>
          <span>مهر و امضای مدرسه</span>
        </div>
        <div>
          <span>امضای اولیا</span>
        </div>
      </footer>
      <p className="print-footnote">
        صادرشده در {dateFa(card.generated_at)} · مدرسه‌یار — سامانه مدیریت مدرسه
      </p>
    </article>
  );
}

export default function PrintCards() {
  const { classId } = useParams();
  const [params] = useSearchParams();
  const studentId = params.get('student');
  const { user } = useApp();
  const [cards, setCards] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      if (studentId) {
        setCards([await api(`/analysis/report-card/${studentId}`)]);
      } else {
        const list = await api(`/analysis/report-cards?${query({ class_id: classId })}`);
        const detailed = await Promise.all(
          list.rows.map((row) => api(`/analysis/report-card/${row.id}`)),
        );
        setCards(detailed);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (studentId || classId) load();
  }, [studentId, classId]);

  if (!studentId && !classId)
    return (
      <div className="print-page">
        <Empty
          title="برای چاپ کارنامه، دانش‌آموز یا کلاس را انتخاب کنید"
          description="از صفحه گزارش‌ها یا پرونده دانش‌آموز، دکمه «چاپ کارنامه» را بزنید."
          icon="FileText"
        />
      </div>
    );
  return (
    <div className="print-page">
      <div className="print-toolbar no-print">
        <Button icon="ArrowRight" variant="secondary" onClick={() => window.history.back()}>
          بازگشت
        </Button>
        <Button icon="Download" loading={busy} onClick={load}>
          به‌روزرسانی
        </Button>
        <Button icon="FileText" onClick={() => window.print()}>
          چاپ کارنامه‌ها
        </Button>
        <span className="print-hint">
          <Icon name="Info" size={16} />
          برای بهترین نتیجه، در پنجره چاپ گزینه «چاپ پس‌زمینه‌ها» را خاموش بگذارید.
        </span>
      </div>
      {error ? (
        <ErrorBox error={error} onRetry={load} />
      ) : cards === null ? (
        <Loading rows={6} />
      ) : cards.length ? (
        <div className="print-stack">
          {cards.map((card) => (
            <ReportCardSheet key={card.student.id} card={card} />
          ))}
        </div>
      ) : (
        <Empty title="کارنامه‌ای برای چاپ پیدا نشد" icon="FileText" />
      )}
      {!user?.role && null}
    </div>
  );
}
