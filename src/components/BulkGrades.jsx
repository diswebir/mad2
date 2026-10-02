import React, { useEffect, useMemo, useState } from 'react';
import { api, describeError, fa } from '../lib/api';
import { useApp } from '../context';
import { Button, ErrorBox, Icon, Modal, SearchSelect } from './ui';

// Enter one column of scores for a whole class instead of opening a form per student.
export function BulkGrades({ onClose, onSaved }) {
  const { toast, lookups } = useApp();
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [title, setTitle] = useState('ارزشیابی کلاسی');
  const [maxScore, setMaxScore] = useState(20);
  const [coefficient, setCoefficient] = useState(1);
  const [roster, setRoster] = useState([]);
  const [scores, setScores] = useState({});
  const [busy, setBusy] = useState(false);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!classId) {
      setRoster([]);
      return;
    }
    let live = true;
    setLoadingRoster(true);
    api(`/classes/${classId}/roster`)
      .then((data) => {
        if (!live) return;
        const rows = Array.isArray(data) ? data : data.rows || data.students || [];
        setRoster(rows);
        setScores(Object.fromEntries(rows.map((row) => [row.id, ''])));
      })
      .catch((e) => setError(e.message))
      .finally(() => live && setLoadingRoster(false));
    return () => {
      live = false;
    };
  }, [classId]);

  const filled = useMemo(
    () =>
      Object.entries(scores).filter(
        ([, value]) => value !== '' && value !== null && !Number.isNaN(Number(value)),
      ),
    [scores],
  );
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api('/assignments/grades/bulk', {
        method: 'POST',
        body: {
          class_id: Number(classId),
          subject_id: Number(subjectId),
          title,
          max_score: Number(maxScore),
          coefficient: Number(coefficient),
          scores: filled.map(([id, score]) => ({
            student_id: Number(id),
            score: Number(score),
          })),
        },
      });
      toast(
        `${fa(result.created || 0)} نمره جدید و ${fa(result.updated || 0)} نمره به‌روزرسانی شد.`,
      );
      onSaved?.();
      onClose();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="ثبت گروهی نمره"
      subtitle="یک ارزشیابی برای همه دانش‌آموزان کلاس؛ خالی گذاشتن هر ردیف یعنی ثبت‌نشده."
      wide
      onClose={onClose}
    >
      <div className="modal-body">
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="bulk-class">کلاس</label>
            <SearchSelect
              id="bulk-class"
              value={classId}
              onChange={setClassId}
              placeholder="جست‌وجو یا انتخاب کلاس..."
              ariaLabel="کلاس"
              options={(lookups.classes || []).map((c) => ({ value: c.id, label: c.label }))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="bulk-subject">درس</label>
            <SearchSelect
              id="bulk-subject"
              value={subjectId}
              onChange={setSubjectId}
              placeholder="جست‌وجو یا انتخاب درس..."
              ariaLabel="درس"
              options={(lookups.subjects || []).map((s) => ({ value: s.id, label: s.label }))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="bulk-title">عنوان ارزشیابی</label>
            <input
              id="bulk-title"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="bulk-max">نمره کامل</label>
            <input
              id="bulk-max"
              type="number"
              min="1"
              max="100"
              step="0.25"
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="bulk-coefficient">ضریب</label>
            <input
              id="bulk-coefficient"
              type="number"
              min="0.1"
              max="10"
              step="0.5"
              value={coefficient}
              onChange={(e) => setCoefficient(e.target.value)}
            />
          </div>
        </div>
        {loadingRoster ? (
          <p className="muted">در حال دریافت فهرست دانش‌آموزان...</p>
        ) : roster.length > 0 ? (
          <div className="table-scroll bulk-grades-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>دانش‌آموز</th>
                  <th>نمره از {maxScore}</th>
                  <th>وضعیت ثبت</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {`${row.first_name || ''} ${row.last_name || ''}`.trim() ||
                        row.full_name ||
                        `#${fa(row.id)}`}
                    </td>
                    <td className="score-cell">
                      <input
                        aria-label={`نمره ${row.first_name || row.id}`}
                        type="number"
                        min="0"
                        max={maxScore}
                        step="0.25"
                        value={scores[row.id] ?? ''}
                        onChange={(e) => setScores((s) => ({ ...s, [row.id]: e.target.value }))}
                      />
                    </td>
                    <td>
                      {scores[row.id] === '' ? (
                        <span className="muted">ثبت‌نشده</span>
                      ) : (
                        <span className="chip chip-green">
                          <Icon name="Check" size={14} /> آماده ثبت
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {error && <ErrorBox error={error} />}
      </div>
      <footer className="modal-footer">
        <Button
          loading={busy}
          disabled={!classId || !subjectId || filled.length === 0}
          onClick={submit}
          icon="Save"
        >
          ثبت {fa(filled.length)} نمره
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          انصراف
        </Button>
      </footer>
    </Modal>
  );
}

// Bulk edit applies the same value to the chosen field of every selected row.
export function BulkEdit({ def, count, onApply, onClose }) {
  const selectFields = def.fields.filter((f) => f.type === 'select');
  const [field, setField] = useState(selectFields[0]?.name || '');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const active = selectFields.find((f) => f.name === field);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onApply({ [field]: value });
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="ویرایش گروهی" subtitle={`${fa(count)} رکورد انتخاب‌شده`} onClose={onClose}>
      <div className="modal-body">
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="bulk-field">فیلد</label>
            <select
              id="bulk-field"
              value={field}
              onChange={(e) => {
                setField(e.target.value);
                setValue('');
              }}
            >
              {selectFields.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="bulk-value">مقدار جدید</label>
            <select id="bulk-value" value={value} onChange={(e) => setValue(e.target.value)}>
              <option value="">انتخاب مقدار</option>
              {(active?.options || []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && <ErrorBox error={error} />}
      </div>
      <footer className="modal-footer">
        <Button loading={busy} disabled={!field || !value} onClick={submit} icon="Save">
          اعمال روی {fa(count)} رکورد
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          انصراف
        </Button>
      </footer>
    </Modal>
  );
}
