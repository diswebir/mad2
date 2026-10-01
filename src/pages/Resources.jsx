import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { moduleDefs, moduleGroups, resourceDefs, resourceLabel } from '../../shared/catalog';
import { useApp, useApi } from '../context';
import {
  api,
  dateFa,
  describeError,
  download,
  fa,
  labelMap,
  money,
  query,
  today,
  upload,
} from '../lib/api';
import {
  Avatar,
  Badge,
  Button,
  Confirm,
  Credentials,
  Empty,
  ErrorBox,
  Icon,
  IconButton,
  Loading,
  Modal,
  PageHeader,
  SearchInput,
  statusTone,
} from '../components/ui';

export function FieldValue({ field, value }) {
  const { lookups } = useApp();
  if (value === null || value === undefined || value === '')
    return <span className="muted">—</span>;
  if (field.type === 'reference')
    return lookups[field.resource]?.find((r) => r.id === Number(value))?.label || `#${fa(value)}`;
  if (field.type === 'select') {
    const label = field.options.find((o) => o.value === String(value))?.label || value;
    return field.name === 'status' ||
      (field.name === 'type' && ['positive', 'warning', 'incident'].includes(value)) ? (
      <Badge tone={statusTone(value)} dot>
        {label}
      </Badge>
    ) : (
      label
    );
  }
  if (field.type === 'date') return dateFa(value);
  if (field.type === 'time')
    return <span dir="ltr">{String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])}</span>;
  if (field.type === 'file')
    return (
      <a className="file-link" href={`/api/files/${value}`} target="_blank" rel="noreferrer">
        <Icon name="Download" size={16} />
        دریافت فایل
      </a>
    );
  if (field.type === 'number') return field.label.includes('تومان') ? money(value) : fa(value);
  if (['tel', 'email'].includes(field.type))
    return (
      <span dir="ltr" className="ltr-value">
        {value}
      </span>
    );
  return String(value);
}
function FormField({ field: f, value, onChange, busy, resource, setError }) {
  const { lookups } = useApp(),
    [uploading, setUploading] = useState(false),
    [fileName, setFileName] = useState('');
  const id = `field-${resource}-${f.name}`;
  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await upload(file, resource);
      onChange(result.id);
      setFileName(result.name);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };
  const attrs = {
    id,
    required: !!f.required,
    disabled: busy,
    value: value ?? '',
    onChange: (e) => onChange(e.target.value),
  };
  return (
    <div className={`form-field ${f.type === 'textarea' || f.type === 'file' ? 'full-width' : ''}`}>
      <label htmlFor={id}>
        {f.label}
        {f.required && <span className="required-star">*</span>}
      </label>
      {f.type === 'textarea' ? (
        <textarea {...attrs} rows={3} placeholder={`${f.label} را بنویسید...`} maxLength={10000} />
      ) : f.type === 'select' ? (
        <select {...attrs}>
          <option value="">انتخاب کنید</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : f.type === 'reference' ? (
        <select {...attrs}>
          <option value="">انتخاب {f.label}</option>
          {lookups[f.resource]?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      ) : f.type === 'file' ? (
        <div className="file-upload-field">
          <input
            type="file"
            id={id}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx"
            disabled={busy || uploading}
            onChange={handleFile}
          />
          <Icon
            name={uploading ? 'LoaderCircle' : 'Upload'}
            className={uploading ? 'spin' : ''}
            size={24}
          />
          <span>
            {uploading
              ? 'در حال بارگذاری...'
              : fileName ||
                (value
                  ? 'فایل انتخاب‌شده · برای جایگزینی کلیک کنید'
                  : 'برای انتخاب فایل کلیک کنید')}
          </span>
          <small>PDF، تصویر، متن یا Word · حداکثر ۵ مگابایت</small>
          {value && (
            <a
              href={`/api/files/${value}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              مشاهده فایل فعلی
            </a>
          )}
        </div>
      ) : (
        <input
          {...attrs}
          type={['number', 'date', 'time', 'email', 'tel'].includes(f.type) ? f.type : 'text'}
          min={f.min}
          max={f.max}
          step={f.type === 'number' ? (f.integer ? 1 : 'any') : undefined}
          maxLength={f.pattern === 'national' ? 10 : 300}
          placeholder={f.type === 'date' ? undefined : f.label}
          dir={
            ['tel', 'email', 'time'].includes(f.type) || f.pattern === 'national'
              ? 'ltr'
              : undefined
          }
        />
      )}
      {f.type === 'date' && value && <small className="field-hint">{dateFa(value)}</small>}
    </div>
  );
}
export function ResourceForm({ resource, row, defaults = {}, onClose, onSaved }) {
  const { can, lookups, user } = useApp(),
    def = resourceDefs[resource];
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      def.fields.map((f) => [
        f.name,
        row?.[f.name] ??
          defaults[f.name] ??
          f.default ??
          (f.type === 'date' && f.required
            ? today()
            : f.type === 'reference' && lookups[f.resource]?.length === 1
              ? lookups[f.resource][0].id
              : ''),
      ]),
    ),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = Object.fromEntries(
        def.fields.map((f) => [
          f.name,
          values[f.name] === ''
            ? null
            : ['number', 'reference', 'file'].includes(f.type)
              ? Number(values[f.name])
              : String(values[f.name] ?? ''),
        ]),
      );
      const result = await api(`/entities/${resource}${row ? `/${row.id}` : ''}`, {
        method: row ? 'PATCH' : 'POST',
        body: row ? { ...body, revision: row.revision } : body,
      });
      await onSaved(result);
      onClose();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  const missingReference = def.fields.find(
    (f) => f.type === 'reference' && f.required && !(lookups[f.resource] || []).length,
  );
  return (
    <Modal
      title={`${row ? 'ویرایش' : 'افزودن'} ${def.singular}`}
      subtitle="اطلاعات را دقیق وارد کنید؛ موارد ستاره‌دار الزامی هستند."
      wide
      onClose={onClose}
    >
      <form onSubmit={save}>
        <div className="modal-body">
          {error && <ErrorBox error={error} />}
          {missingReference && (
            <div className="info-box warning-box">
              <Icon name="AlertCircle" size={20} />
              <span>
                برای ثبت «{def.singular}» ابتدا باید حداقل یک «{missingReference.label}» وجود داشته
                باشد.
              </span>
            </div>
          )}
          {!row && ['students', 'teachers'].includes(resource) && can(`${resource}.account`) && (
            <div className="info-box">
              <Icon name="KeyRound" size={20} />
              <span>
                یک حساب کاربری با رمز موقت به‌صورت خودکار ساخته می‌شود؛ اطلاعات ورود پس از ثبت نمایش
                داده می‌شود.
              </span>
            </div>
          )}
          <div className="form-grid">
            {def.fields.map((f) => (
              <FormField
                key={f.name}
                field={f}
                resource={resource}
                value={values[f.name]}
                busy={busy}
                setError={setError}
                onChange={(value) => setValues((v) => ({ ...v, [f.name]: value }))}
              />
            ))}
          </div>
        </div>
        <footer className="modal-footer">
          <Button type="submit" icon="Check" loading={busy} disabled={!!missingReference}>
            {row ? 'ذخیره تغییرات' : `ثبت ${def.singular}`}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            انصراف
          </Button>
          <span className="form-footer-note">
            <Icon name="ShieldCheck" size={14} />
            ثبت با دسترسی {user.role === 'admin' ? 'مدیر' : 'حساب شما'}
          </span>
        </footer>
      </form>
    </Modal>
  );
}
export function GenericDetail({ resource, row, onClose, onEdit, onDelete, onAccountCreated }) {
  const { can, user, toast, refreshLookups } = useApp(),
    def = resourceDefs[resource];
  const [account, setAccount] = useState(null),
    [accountBusy, setAccountBusy] = useState(false),
    [hasAccount, setHasAccount] = useState(!!row.user_id);
  const permissions = row.permissions || {};
  const makeAccount = async () => {
    setAccountBusy(true);
    try {
      const result = await api(`/settings/accounts/create/${resource}/${row.id}`, {
        method: 'POST',
        body: {},
      });
      setAccount(result);
      setHasAccount(true);
      await refreshLookups();
      onAccountCreated?.();
      toast('حساب کاربری ساخته شد.');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setAccountBusy(false);
    }
  };
  return (
    <>
      <Modal
        title={resourceLabel(resource, row)}
        subtitle={`جزئیات ${def.singular}`}
        wide
        onClose={onClose}
      >
        <div className="modal-body">
          <div className="detail-grid">
            {[...def.fields, ...(def.computed || [])].map((f) => (
              <div
                className={`detail-field ${f.type === 'textarea' ? 'full-width' : ''}`}
                key={f.name}
              >
                <span>{f.label}</span>
                <strong>
                  <FieldValue field={f} value={row[f.name]} />
                </strong>
              </div>
            ))}
          </div>
          <div className="record-meta">
            <span>شناسه: {fa(row.id)}</span>
            <span>ثبت: {dateFa(row.created_at)}</span>
          </div>
        </div>
        <footer className="modal-footer">
          {['students', 'teachers'].includes(resource) &&
            user.role === 'admin' &&
            !hasAccount &&
            can(`${resource}.account`) && (
              <Button
                variant="secondary"
                icon="KeyRound"
                loading={accountBusy}
                onClick={makeAccount}
              >
                ساخت حساب کاربری
              </Button>
            )}
          {(permissions.edit ?? (def.write.includes(user.role) && can(`${resource}.edit`))) && (
            <Button icon="Pencil" onClick={() => onEdit(row)}>
              ویرایش {def.singular}
            </Button>
          )}
          {(permissions.delete ?? (def.write.includes(user.role) && can(`${resource}.delete`))) &&
            onDelete && (
              <Button variant="danger-light" icon="Trash2" onClick={() => onDelete(row)}>
                حذف
              </Button>
            )}
          <Button variant="secondary" onClick={onClose}>
            بستن
          </Button>
        </footer>
      </Modal>
      {account && <Credentials account={account} onClose={() => setAccount(null)} />}
    </>
  );
}
export function StudentProfile({ id, onClose, onEdit }) {
  const { can, user, lookups, toast, refreshLookups } = useApp(),
    [tab, setTab] = useState('info'),
    [account, setAccount] = useState(null),
    [busy, setBusy] = useState(false);
  const { data, loading, error, refresh } = useApi(`/students/${id}/profile`);
  const student = data?.student;
  const grades = data?.grades || [],
    attendance = data?.attendance || [];
  const avg = grades.length
    ? grades.reduce((sum, g) => sum + (g.score / g.max_score) * 20 * g.coefficient, 0) /
      grades.reduce((sum, g) => sum + g.coefficient, 0)
    : 0;
  const rate = attendance.length
    ? (attendance.filter((a) => ['present', 'late'].includes(a.status)).length /
        attendance.length) *
      100
    : 0;
  const tabs = [
    ['info', 'اطلاعات فردی', 'CircleUserRound'],
    ['guardian', 'اولیا و تماس', 'UsersRound'],
    ...(data?.attendance ? [['attendance', 'حضور و غیاب', 'CalendarCheck2']] : []),
    ...(data?.grades ? [['grades', 'نمرات', 'Award']] : []),
    ...(data?.documents ? [['documents', 'مدارک', 'FolderOpen']] : []),
    ...(data?.discipline || data?.health || data?.counseling
      ? [['records', 'سوابق', 'ClipboardList']]
      : []),
  ];
  const create = async () => {
    setBusy(true);
    try {
      const a = await api(`/settings/accounts/create/students/${id}`, { method: 'POST', body: {} });
      setAccount(a);
      refresh();
      await refreshLookups();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const fields = resourceDefs.students.fields.filter((f) =>
    tab === 'guardian'
      ? [
          'guardian_name',
          'guardian_phone',
          'guardian_relation',
          'emergency_phone',
          'phone',
          'email',
          'address',
        ].includes(f.name)
      : [
          'national_id',
          'birth_date',
          'gender',
          'blood_type',
          'medical_notes',
          'route_id',
          'status',
        ].includes(f.name),
  );
  return (
    <>
      <Modal
        title="پرونده دانش‌آموز"
        subtitle="اطلاعات یکپارچه تحصیلی، فردی و ارتباط با اولیا"
        wide
        onClose={onClose}
        className="profile-modal"
      >
        <div className="modal-body">
          {error ? (
            <ErrorBox error={error} onRetry={refresh} />
          ) : loading && !data ? (
            <Loading />
          ) : (
            student && (
              <>
                <div className="student-profile-hero">
                  <Avatar
                    name={`${student.first_name} ${student.last_name}`}
                    id={student.id}
                    size="xl"
                  />
                  <div>
                    <h2>
                      {student.first_name} {student.last_name}
                      <Badge tone="green" dot>
                        {labelMap[student.status]}
                      </Badge>
                    </h2>
                    <p>
                      <Icon name="School" size={16} />
                      {data.class.name}
                      <span>·</span>معلم راهنما: {data.teacher.first_name} {data.teacher.last_name}
                    </p>
                    <small>
                      کد دانش‌آموزی {fa(student.id)}
                      {data.username ? ` · نام کاربری: ${data.username}` : ''}
                    </small>
                  </div>
                </div>
                <div className="profile-stat-row">
                  {data.grades && (
                    <div>
                      <Icon name="Award" />
                      <strong>{fa(avg)}</strong>
                      <span>میانگین از ۲۰</span>
                    </div>
                  )}
                  {data.attendance && (
                    <div>
                      <Icon name="CalendarCheck2" />
                      <strong>{fa(Math.round(rate))}٪</strong>
                      <span>حضور در {fa(attendance.length)} روز ثبت‌شده</span>
                    </div>
                  )}
                  {data.documents && (
                    <div>
                      <Icon name="FolderOpen" />
                      <strong>{fa(data.documents.length)}</strong>
                      <span>مدرک در پرونده</span>
                    </div>
                  )}
                </div>
                <div className="tabs profile-tabs">
                  {tabs.map(([key, label, icon]) => (
                    <button
                      key={key}
                      className={tab === key ? 'active' : ''}
                      onClick={() => setTab(key)}
                    >
                      <Icon name={icon} size={16} />
                      {label}
                    </button>
                  ))}
                </div>
                {['info', 'guardian'].includes(tab) && (
                  <div className="detail-grid">
                    {fields.map((f) => (
                      <div
                        className={`detail-field ${['address', 'medical_notes'].includes(f.name) ? 'full-width' : ''}`}
                        key={f.name}
                      >
                        <span>{f.label}</span>
                        <strong>
                          <FieldValue field={f} value={student[f.name]} />
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
                {tab === 'attendance' && (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>تاریخ</th>
                          <th>روز</th>
                          <th>وضعیت</th>
                          <th>یادداشت</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendance.map((a) => (
                          <tr key={a.id}>
                            <td>{dateFa(a.date)}</td>
                            <td>{dateFa(a.date, { weekday: 'long' })}</td>
                            <td>
                              <Badge tone={statusTone(a.status)} dot>
                                {labelMap[a.status]}
                              </Badge>
                            </td>
                            <td>{a.note || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!attendance.length && <Empty title="سابقه حضور ثبت نشده" />}
                  </div>
                )}
                {tab === 'grades' && (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>درس</th>
                          <th>ارزشیابی</th>
                          <th>نمره</th>
                          <th>ضریب</th>
                          <th>یادداشت</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grades.map((g) => (
                          <tr key={g.id}>
                            <td>{lookups.subjects?.find((s) => s.id === g.subject_id)?.label}</td>
                            <td>{g.title}</td>
                            <td>
                              <span
                                className={`grade-value ${g.score / g.max_score >= 0.75 ? 'good' : ''}`}
                              >
                                {fa(g.score)}
                                <small> / {fa(g.max_score)}</small>
                              </span>
                            </td>
                            <td>{fa(g.coefficient)}</td>
                            <td>{g.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!grades.length && <Empty title="نمره‌ای ثبت نشده" />}
                  </div>
                )}
                {tab === 'documents' && (
                  <div className="document-list">
                    {data.documents.map((d) => (
                      <div key={d.id}>
                        <span className="document-icon">
                          <Icon name="FileText" size={25} />
                        </span>
                        <div>
                          <strong>{d.title}</strong>
                          <small>
                            {
                              resourceDefs.documents.fields
                                .find((f) => f.name === 'type')
                                .options.find((o) => o.value === d.type)?.label
                            }
                          </small>
                        </div>
                        <a
                          className="btn btn-secondary"
                          href={`/api/files/${d.file_id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Icon name="Download" size={17} />
                          دریافت
                        </a>
                      </div>
                    ))}
                    {!data.documents.length && (
                      <Empty
                        title="هنوز مدرکی اضافه نشده"
                        description="مدارک را از زبانه مدارک در صفحه دانش‌آموزان بارگذاری کنید."
                      />
                    )}
                  </div>
                )}
                {tab === 'records' && (
                  <div className="profile-records">
                    {['discipline', 'health', 'counseling'].flatMap((resource) =>
                      (data[resource] || []).map((r) => (
                        <div key={`${resource}-${r.id}`}>
                          <span
                            className={`small-icon tone-${resource === 'health' ? 'green' : 'purple'}`}
                          >
                            <Icon name={resourceDefs[resource].icon} />
                          </span>
                          <div>
                            <strong>{r.title}</strong>
                            <small>
                              {resourceDefs[resource].singular} ·{' '}
                              {dateFa(r.record_date || r.check_date || r.session_date)}
                            </small>
                            <p>{r.action || r.description || r.notes}</p>
                          </div>
                        </div>
                      )),
                    )}
                  </div>
                )}
              </>
            )
          )}
        </div>
        <footer className="modal-footer">
          {(data?.student?.permissions?.edit ??
            (student && user.role === 'admin' && can('students.edit'))) && (
            <Button icon="Pencil" onClick={() => onEdit(student)}>
              ویرایش پرونده
            </Button>
          )}
          {student && user.role === 'admin' && !student.user_id && can('students.account') && (
            <Button variant="secondary" icon="KeyRound" loading={busy} onClick={create}>
              ساخت حساب کاربری
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            بستن پرونده
          </Button>
        </footer>
      </Modal>
      {account && <Credentials account={account} onClose={() => setAccount(null)} />}
    </>
  );
}
function ClassDetail({ row, onClose, onEdit }) {
  const { lookups, can, user } = useApp();
  const { data, loading, error } = useApi(
    can('classes.roster') ? `/classes/${row.id}/roster` : null,
  );
  const teacher = lookups.teachers?.find((t) => t.id === row.teacher_id)?.label;
  return (
    <Modal
      title={`کلاس ${row.name}`}
      subtitle={`پایه ${resourceDefs.classes.fields.find((f) => f.name === 'grade').options.find((o) => o.value === row.grade)?.label} · اتاق ${row.room || '—'}`}
      wide
      onClose={onClose}
    >
      <div className="modal-body">
        <div className="class-detail-summary">
          <div className="class-card-icon">
            <Icon name="School" size={30} />
          </div>
          <div>
            <h3>معلم راهنما: {teacher || 'معلم کلاس'}</h3>
            <p>
              ظرفیت {fa(row.capacity)} نفر · نوبت {row.shift === 'morning' ? 'صبح' : 'عصر'}
            </p>
          </div>
          <Badge tone="purple">{fa(row.student_count ?? data?.length ?? 0)} دانش‌آموز</Badge>
        </div>
        <h3 className="section-title">دانش‌آموزان کلاس</h3>
        {error ? (
          <ErrorBox error={error} />
        ) : loading ? (
          <Loading />
        ) : data?.length ? (
          <div className="roster-grid">
            {data.map((s) => (
              <div className="roster-item" key={s.id}>
                <Avatar name={`${s.first_name} ${s.last_name}`} id={s.id} size="sm" />
                <span>
                  {s.first_name} {s.last_name}
                </span>
                <Badge tone={statusTone(s.status)}>{labelMap[s.status]}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title={
              can('classes.roster') ? 'کلاس هنوز دانش‌آموزی ندارد' : 'نمایش اعضای کلاس غیرفعال است'
            }
          />
        )}
      </div>
      <footer className="modal-footer">
        {(row.permissions?.edit ?? (user.role === 'admin' && can('classes.edit'))) && (
          <Button icon="Pencil" onClick={() => onEdit(row)}>
            ویرایش کلاس
          </Button>
        )}
        <Button variant="secondary" onClick={onClose}>
          بستن
        </Button>
      </footer>
    </Modal>
  );
}
function AssignmentDetail({ row, onClose, onEdit }) {
  const { user, can, toast } = useApp();
  const allowed =
    ['student', 'parent'].includes(user.role) ||
    row.permissions?.review ||
    can('assignments.review');
  const { data, loading, error, refresh } = useApi(
    allowed ? `/assignments/${row.id}/submissions` : null,
  );
  const [body, setBody] = useState(''),
    [file, setFile] = useState(null),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(null),
    [score, setScore] = useState(''),
    [feedback, setFeedback] = useState(''),
    [allowResubmit, setAllowResubmit] = useState(false);
  const mine = data?.[0];
  const locked = !!mine && mine.score !== null && !mine.allow_resubmit;
  const dirty = !!mine && (body !== mine.body || !!file);
  useEffect(() => {
    if (user.role === 'student' && mine) setBody(mine.body);
  }, [mine, user.role]);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const uploaded = file ? await upload(file, 'submission') : null;
      await api(`/assignments/${row.id}/submit`, {
        method: 'POST',
        body: {
          body,
          file_id: uploaded?.id || mine?.file_id || null,
          revision: mine?.revision,
        },
      });
      toast('تکلیف شما با موفقیت تحویل شد.');
      refresh();
      setFile(null);
    } catch (e) {
      toast(describeError(e), 'error');
      if (e.code === 'STALE_RECORD' || e.status === 409) refresh();
    } finally {
      setBusy(false);
    }
  };
  const grade = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/assignments/${row.id}/submissions/${review.id}`, {
        method: 'PATCH',
        body: {
          score: Number(score),
          feedback,
          allow_resubmit: allowResubmit,
          revision: review.revision,
        },
      });
      toast('ارزیابی ذخیره شد.');
      setReview(null);
      refresh();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Modal
        title={row.title}
        subtitle={`مهلت تحویل: ${dateFa(row.due_date)} · نمره کامل: ${fa(row.max_score)}`}
        wide
        onClose={onClose}
      >
        <div className="modal-body">
          <p className="assignment-description">{row.description}</p>
          {row.file_id && (
            <a
              className="btn btn-secondary"
              href={`/api/files/${row.file_id}`}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="Download" />
              فایل تکلیف
            </a>
          )}
          <h3 className="section-title">
            {user.role === 'student'
              ? 'پاسخ من'
              : user.role === 'parent'
                ? 'پاسخ دانش‌آموز'
                : 'پاسخ‌های تحویل‌شده'}
          </h3>
          {error && <ErrorBox error={error} />}
          {loading ? (
            <Loading rows={2} />
          ) : (
            data?.map((s) => (
              <div className="submission-card" key={s.id}>
                <div className="submission-header">
                  <Avatar name={`${s.first_name} ${s.last_name}`} id={s.student_id} size="sm" />
                  <strong>
                    {s.first_name} {s.last_name}
                  </strong>
                  <small>{dateFa(s.submitted_at)}</small>
                  {s.score !== null ? (
                    <Badge tone="green">نمره {fa(s.score)}</Badge>
                  ) : (
                    <Badge tone="orange">در انتظار بررسی</Badge>
                  )}
                  {s.score !== null && !s.allow_resubmit && (
                    <Badge tone="neutral">
                      <Icon name="LockKeyhole" size={12} /> قفل‌شده
                    </Badge>
                  )}
                </div>
                <p>{s.body}</p>
                {s.file_id && (
                  <a
                    className="file-link"
                    href={`/api/files/${s.file_id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Icon name="Paperclip" size={16} />
                    {s.file_name}
                  </a>
                )}
                {s.feedback && (
                  <div className="teacher-feedback">
                    <Icon name="MessageCircle" size={16} />
                    {s.feedback}
                  </div>
                )}
                {['admin', 'teacher'].includes(user.role) &&
                  (row.permissions?.review ?? can('assignments.review')) && (
                    <Button
                      variant="secondary"
                      icon="Award"
                      onClick={() => {
                        setReview(s);
                        setScore(s.score ?? '');
                        setFeedback(s.feedback || '');
                        setAllowResubmit(!!s.allow_resubmit);
                      }}
                    >
                      ارزیابی پاسخ
                    </Button>
                  )}
              </div>
            ))
          )}
          {!loading && !data?.length && <p className="muted">هنوز پاسخی تحویل داده نشده است.</p>}
          {user.role === 'student' &&
            can('assignments.submit') &&
            row.status === 'published' &&
            row.due_date >= today() && (
              <form onSubmit={submit} className="assignment-submit-form">
                <label htmlFor="assignment-response">متن پاسخ</label>
                <textarea
                  id="assignment-response"
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  maxLength={10000}
                  placeholder="پاسخ خود را بنویسید..."
                />
                <label className="attachment-chooser">
                  <Icon name="Paperclip" size={17} />
                  {file ? file.name : 'افزودن فایل پاسخ (اختیاری)'}
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx"
                    onChange={(e) => setFile(e.target.files[0] || null)}
                  />
                </label>
                <Button type="submit" loading={busy} icon="Send" disabled={locked || !dirty}>
                  {data?.length ? 'ارسال مجدد پاسخ' : 'تحویل تکلیف'}
                </Button>
                {locked && (
                  <p className="muted small-text">
                    <Icon name="LockKeyhole" size={14} /> این پاسخ ارزیابی شده است؛ برای ویرایش از
                    معلم درخواست کنید ارسال مجدد را فعال کند.
                  </p>
                )}
              </form>
            )}
        </div>
        <footer className="modal-footer">
          {(row.permissions?.edit ??
            (resourceDefs.assignments.write.includes(user.role) && can('assignments.edit'))) && (
            <Button icon="Pencil" onClick={() => onEdit(row)}>
              ویرایش تکلیف
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            بستن
          </Button>
        </footer>
      </Modal>
      {review && (
        <Modal
          title="ارزیابی تکلیف"
          subtitle={`${review.first_name} ${review.last_name}`}
          onClose={() => setReview(null)}
        >
          <form onSubmit={grade}>
            <div className="modal-body form-stack">
              <label>
                نمره از {fa(row.max_score)}
                <input
                  required
                  type="number"
                  min="0"
                  max={row.max_score}
                  step="0.1"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                />
              </label>
              <label>
                بازخورد معلم
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={3}
                  maxLength={3000}
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={allowResubmit}
                  onChange={(e) => setAllowResubmit(e.target.checked)}
                />
                اجازه ارسال مجدد به دانش‌آموز
              </label>
            </div>
            <footer className="modal-footer">
              <Button type="submit" loading={busy} icon="Check">
                ثبت ارزیابی
              </Button>
              <Button variant="secondary" onClick={() => setReview(null)}>
                انصراف
              </Button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
function InvoiceDetail({ row, onClose, onEdit, onChanged }) {
  const { user, can, toast, refreshLookups, lookups } = useApp();
  const [form, setForm] = useState(false);
  const { data, loading, error, refresh } = useApi(
    can('payments.view') ? `/entities/payments?invoice_id=${row.id}&limit=100` : null,
  );
  const [current, setCurrent] = useState(row);
  const changed = async () => {
    setCurrent(await api(`/entities/invoices/${row.id}`));
    refresh();
    await refreshLookups();
    onChanged();
    toast('پرداخت ثبت و مانده صورتحساب به‌روز شد.');
  };
  return (
    <>
      <Modal
        title={current.title}
        subtitle={`صورتحساب ${lookups.students?.find((s) => s.id === current.student_id)?.label || 'دانش‌آموز'}`}
        wide
        onClose={onClose}
      >
        <div className="modal-body">
          <div className="invoice-summary">
            <div>
              <span>مبلغ صورتحساب</span>
              <strong>{money(current.amount)}</strong>
            </div>
            <div>
              <span>پرداخت‌شده</span>
              <strong className="green-text">{money(current.paid_amount)}</strong>
            </div>
            <div>
              <span>مانده قابل پرداخت</span>
              <strong className="purple-text">{money(current.amount - current.paid_amount)}</strong>
            </div>
          </div>
          <div className="invoice-meta">
            <Badge tone={statusTone(current.status)} dot>
              {labelMap[current.status]}
            </Badge>
            <span>سررسید: {dateFa(current.due_date)}</span>
            <span>دوره: {current.term}</span>
          </div>
          <h3 className="section-title">رسیدهای پرداخت</h3>
          {error && <ErrorBox error={error} />}
          {loading ? (
            <Loading rows={2} />
          ) : data?.rows.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>تاریخ</th>
                  <th>مبلغ</th>
                  <th>شماره پیگیری</th>
                  <th>روش</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((p) => (
                  <tr key={p.id}>
                    <td>{dateFa(p.payment_date)}</td>
                    <td>{money(p.amount)}</td>
                    <td dir="ltr">{p.reference}</td>
                    <td>
                      {
                        resourceDefs.payments.fields
                          .find((f) => f.name === 'method')
                          .options.find((o) => o.value === p.method)?.label
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty
              title="پرداختی ثبت نشده"
              description="رسیدهای ثبت‌شده توسط مدیر در این قسمت نمایش داده می‌شود."
              icon="CreditCard"
            />
          )}
          <p className="muted small-text">
            پرداخت‌های این نسخه، ثبت رسید واریز هستند؛ درگاه پرداخت آنلاین متصل نیست.
          </p>
        </div>
        <footer className="modal-footer">
          {user.role === 'admin' &&
            can('payments.create') &&
            current.paid_amount < current.amount && (
              <Button icon="CreditCard" onClick={() => setForm(true)}>
                ثبت پرداخت
              </Button>
            )}
          {(row.permissions?.edit ?? (user.role === 'admin' && can('invoices.edit'))) && (
            <Button variant="secondary" icon="Pencil" onClick={() => onEdit(current)}>
              ویرایش صورتحساب
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            بستن
          </Button>
        </footer>
      </Modal>
      {form && (
        <ResourceForm
          resource="payments"
          defaults={{ invoice_id: row.id, amount: current.amount - current.paid_amount }}
          onClose={() => setForm(false)}
          onSaved={changed}
        />
      )}
    </>
  );
}
function ImportStudents({ onClose, onSaved }) {
  const { lookups } = useApp();
  const [file, setFile] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [result, setResult] = useState(null);
  const blobDownload = (text, name) => {
    const url = URL.createObjectURL(
      new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const template = () =>
    blobDownload(
      `first_name,last_name,national_id,class_id,guardian_name,guardian_phone,status\r\nسینا,آزمایشی,0999999999,${lookups.classes?.[0]?.id || 1},رضا آزمایشی,09129999999,active`,
      'student-import-template.csv',
    );
  const importFile = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await api('/entities/students/import', { method: 'POST', body });
      setResult(res);
      await onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="ورود گروهی دانش‌آموزان"
      subtitle="حداکثر ۵۰ ردیف در هر فایل؛ ثبت همه ردیف‌ها به‌صورت یکپارچه انجام می‌شود."
      onClose={onClose}
    >
      <form onSubmit={importFile}>
        <div className="modal-body">
          {error && <ErrorBox error={error} />}{' '}
          {result ? (
            <div className="import-success">
              <Icon name="CheckCircle2" size={42} />
              <h3>{fa(result.count)} دانش‌آموز ثبت شد</h3>
              <p>رمزهای موقت فقط در این پنجره قابل دریافت هستند. فایل را در جای امن نگه دارید.</p>
              {result.credentials.length > 0 && (
                <Button
                  variant="secondary"
                  icon="Download"
                  onClick={() =>
                    blobDownload(
                      'student,username,temporary_password\r\n' +
                        result.credentials
                          .map((a) => `${a.student},${a.username},${a.temporary_password}`)
                          .join('\r\n'),
                      'student-accounts.csv',
                    )
                  }
                >
                  دریافت اطلاعات ورود
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="info-box">
                <Icon name="Info" />
                <span>
                  شناسه کلاس باید موجود باشد. کد ملی ۱۰ رقم و شماره ولی ۱۱ رقم است. در صورت خطای یک
                  ردیف، هیچ ردیفی ثبت نمی‌شود.
                </span>
              </div>
              <Button variant="secondary" icon="Download" onClick={template}>
                دریافت فایل الگو
              </Button>
              <label className="csv-file-field">
                فایل CSV با کدگذاری UTF-8
                <input
                  type="file"
                  accept=".csv,text/csv"
                  required
                  onChange={(e) => setFile(e.target.files[0])}
                />
              </label>
            </>
          )}
        </div>
        <footer className="modal-footer">
          {!result && (
            <Button type="submit" loading={busy} disabled={!file} icon="Upload">
              بررسی و ثبت دانش‌آموزان
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {result ? 'پایان' : 'انصراف'}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}

export default function Resources({ moduleId, embedded = false }) {
  const { user, can, moduleOn, lookups, refreshLookups, toast } = useApp();
  const [params, setParams] = useSearchParams();
  const group = (moduleGroups[moduleId] || []).filter((key) =>
    resourceDefs[key].read.includes(user.role),
  );
  const available = group.filter((key) => can(`${key}.view`));
  const selected = available.includes(params.get('tab')) ? params.get('tab') : available[0];
  const def = resourceDefs[selected],
    module = moduleDefs.find((m) => m.id === moduleId);
  const [search, setSearch] = useState(''),
    [debounced, setDebounced] = useState(''),
    [filters, setFilters] = useState({}),
    [showFilters, setShowFilters] = useState(false),
    [page, setPage] = useState(1),
    [limit, setLimit] = useState(10),
    [view, setView] = useState(moduleId === 'classes' ? 'grid' : 'list'),
    [form, setForm] = useState(null),
    [detail, setDetail] = useState(null),
    [remove, setRemove] = useState(null),
    [account, setAccount] = useState(null),
    [importing, setImporting] = useState(false),
    [exporting, setExporting] = useState(false);
  const openedId = useRef(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setPage(1);
    setFilters({});
    setSearch('');
    setDetail(null);
    openedId.current = null;
  }, [selected]);
  const path = selected
    ? `/entities/${selected}?${query({ q: debounced, page, limit, ...filters })}`
    : null;
  const { data, loading, error, refresh } = useApi(path);
  useEffect(() => {
    if (
      params.get('new') === '1' &&
      selected &&
      resourceDefs[selected].write.includes(user.role) &&
      can(`${selected}.create`)
    ) {
      setForm({ row: null });
      const n = new URLSearchParams(params);
      n.delete('new');
      setParams(n, { replace: true });
    }
  }, [selected, params, user.role, can, setParams]);
  useEffect(() => {
    const id = params.get('id');
    if (id && selected && openedId.current !== `${selected}-${id}`) {
      openedId.current = `${selected}-${id}`;
      api(`/entities/${selected}/${id}`)
        .then(setDetail)
        .catch((e) => toast(e.message, 'error'));
    }
  }, [params, selected, toast]);
  const changeTab = (key) => {
    setParams({ tab: key });
    setForm(null);
    setDetail(null);
  };
  const closeDetail = () => {
    setDetail(null);
    const next = new URLSearchParams(params);
    next.delete('id');
    setParams(next, { replace: true });
  };
  const edit = (row) => {
    closeDetail();
    setForm({ row });
  };
  const saved = async (result) => {
    refresh();
    await refreshLookups();
    toast(`${def.singular} با موفقیت ذخیره شد.`);
    if (result?.account) setAccount(result.account);
  };
  const erase = async () => {
    try {
      await api(`/entities/${selected}/${remove.id}`, {
        method: 'DELETE',
        body: { revision: remove.revision },
      });
    } catch (e) {
      // A conflict means the row changed or gained dependents; reload before retrying.
      refresh();
      throw new Error(describeError(e));
    }
    refresh();
    await refreshLookups();
    if (detail?.id === remove.id) closeDetail();
    toast('رکورد با موفقیت حذف شد.');
  };
  const exportRows = async () => {
    setExporting(true);
    try {
      await download(
        `/entities/${selected}/export?${query({ q: debounced, ...filters })}`,
        `${selected}-${today()}.csv`,
      );
      toast('خروجی آماده و دانلود شد.');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setExporting(false);
    }
  };
  if (!moduleOn(moduleId) || !selected)
    return (
      <div className="page-enter">
        <PageHeader title={module?.name || 'بخش مدرسه'} />
        <div className="panel">
          <Empty
            title="این بخش در دسترس نیست"
            description="ماژول یا قابلیت مشاهده غیرفعال است، یا نقش شما به آن دسترسی ندارد."
            icon={module?.icon}
            action={
              user.role === 'admin' ? (
                <Link className="btn btn-primary" to="/modules">
                  مدیریت ماژول‌ها
                </Link>
              ) : null
            }
          />
        </div>
      </div>
    );
  const fields = [...def.fields, ...(def.computed || [])],
    filterFields = def.fields.filter((f) => ['reference', 'select'].includes(f.type));
  const canWrite = def.write.includes(user.role);
  const createBlocked =
    !!def.fields.find(
      (f) => f.type === 'reference' && f.required && !(lookups[f.resource] || []).length,
    ) || !can(`${selected}.view`);
  const columns = def.columns.map((key) => fields.find((f) => f.name === key));
  const descriptions = {
    students: 'یک پرونده کامل، برای هر دانش‌آموز؛ همراه با اطلاعات اولیا.',
    teachers: 'همکاران مدرسه و همراهان مسیر یادگیری را مدیریت کنید.',
    classes: 'فضایی منظم برای یادگیری؛ از معلم راهنما تا اعضای کلاس.',
    education: 'از برنامه درسی تا ارزشیابی، همه در یک فضای یکپارچه.',
    finance: 'صورتحساب‌ها، پرداخت‌ها و هزینه‌های مدرسه، شفاف و دقیق.',
    library: 'کتاب‌ها و گردش امانت را همیشه مرتب نگه دارید.',
    services: 'مدیریت تجهیزات، سرویس و رفت‌وآمدهای مدرسه.',
    announcements: 'خبرهای مدرسه را به دست مخاطب درست برسانید.',
  };
  return (
    <div className={`resource-page page-enter ${embedded ? 'embedded-resource' : ''}`}>
      {!embedded && (
        <PageHeader title={module.name} description={descriptions[moduleId] || module.description}>
          {(selected === 'students' ? can('students.export') : can('reports.export')) && (
            <Button variant="secondary" icon="Download" loading={exporting} onClick={exportRows}>
              خروجی اکسل (CSV)
            </Button>
          )}
          {canWrite && can(`${selected}.create`) && !createBlocked && (
            <Button icon="Plus" onClick={() => setForm({ row: null })}>
              افزودن {def.singular}
            </Button>
          )}
        </PageHeader>
      )}
      {available.length > 1 && (
        <div className="tabs workspace-tabs">
          {available.map((key) => (
            <button
              key={key}
              className={key === selected ? 'active' : ''}
              onClick={() => changeTab(key)}
            >
              <Icon name={resourceDefs[key].icon} size={17} />
              {resourceDefs[key].title}
            </button>
          ))}
        </div>
      )}
      <section className={`panel resource-panel ${view === 'grid' ? 'grid-resource-panel' : ''}`}>
        <div className="resource-toolbar">
          <div className="resource-toolbar-title">
            <h2>{def.title}</h2>
            <Badge tone="purple">
              {fa(data?.total)} {def.singular}
            </Badge>
          </div>
          <div className="resource-toolbar-controls">
            {embedded && canWrite && can(`${selected}.create`) && !createBlocked && (
              <Button icon="Plus" onClick={() => setForm({ row: null })}>
                افزودن {def.singular}
              </Button>
            )}
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={`جست‌وجو در ${def.title}...`}
            />
            {filterFields.length > 0 && (
              <Button
                variant={showFilters ? 'soft' : 'secondary'}
                icon="SlidersHorizontal"
                onClick={() => setShowFilters(!showFilters)}
              >
                فیلتر
                {Object.values(filters).filter(Boolean).length > 0 && (
                  <span className="filter-count">
                    {fa(Object.values(filters).filter(Boolean).length)}
                  </span>
                )}
              </Button>
            )}
            {selected === 'students' &&
              user.role === 'admin' &&
              can('students.import') &&
              can('students.create') && (
                <IconButton
                  name="Upload"
                  label="ورود گروهی CSV"
                  onClick={() => setImporting(true)}
                />
              )}
            <div className="view-switch">
              <IconButton
                name="List"
                label="نمایش فهرست"
                className={view === 'list' ? 'active' : ''}
                onClick={() => setView('list')}
              />
              <IconButton
                name="LayoutGrid"
                label="نمایش کارت‌ها"
                className={view === 'grid' ? 'active' : ''}
                onClick={() => setView('grid')}
              />
            </div>
          </div>
        </div>
        {showFilters && (
          <div className="filter-panel">
            {filterFields.map((f) => (
              <label key={f.name}>
                {f.label}
                <select
                  value={filters[f.name] || ''}
                  onChange={(e) => {
                    setFilters((x) => ({ ...x, [f.name]: e.target.value }));
                    setPage(1);
                  }}
                >
                  <option value="">
                    همه{' '}
                    {f.label === 'کلاس' ? 'کلاس‌ها' : f.label === 'وضعیت' ? 'وضعیت‌ها' : 'موارد'}
                  </option>
                  {f.type === 'select'
                    ? f.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))
                    : lookups[f.resource]?.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                </select>
              </label>
            ))}
            {Object.values(filters).some(Boolean) && (
              <Button
                variant="ghost"
                icon="X"
                onClick={() => {
                  setFilters({});
                  setPage(1);
                }}
              >
                حذف فیلترها
              </Button>
            )}
          </div>
        )}
        {error ? (
          <div className="panel-padding">
            <ErrorBox error={error} onRetry={refresh} />
          </div>
        ) : loading && !data ? (
          <Loading rows={6} />
        ) : data?.rows.length ? (
          view === 'grid' ? (
            <div className="resource-card-grid">
              {data.rows.map((row) => (
                <article
                  className={`resource-card ${selected === 'classes' ? 'class-card' : ''}`}
                  key={row.id}
                >
                  <div className="resource-card-top">
                    {['students', 'teachers'].includes(selected) ? (
                      <Avatar name={resourceLabel(selected, row)} id={row.id} size="lg" />
                    ) : (
                      <span
                        className={`resource-card-icon tone-${['purple', 'blue', 'orange', 'green'][row.id % 4]}`}
                      >
                        <Icon name={def.icon} size={25} />
                      </span>
                    )}
                    <div className="card-row-actions">
                      <IconButton name="Eye" label="مشاهده جزئیات" onClick={() => setDetail(row)} />
                      {(row.permissions?.edit ?? (canWrite && can(`${selected}.edit`))) && (
                        <IconButton name="Pencil" label="ویرایش" onClick={() => edit(row)} />
                      )}
                    </div>
                  </div>
                  <h3>{resourceLabel(selected, row)}</h3>
                  {selected === 'classes' ? (
                    <>
                      <p>
                        {
                          fields
                            .find((f) => f.name === 'grade')
                            ?.options.find((o) => o.value === row.grade)?.label
                        }{' '}
                        · اتاق {row.room || '—'}
                      </p>
                      <div className="class-capacity">
                        <span>
                          <Icon name="UsersRound" size={16} />
                          {fa(
                            row.student_count ??
                              lookups.students?.filter((s) => s.class_id === row.id).length,
                          )}{' '}
                          دانش‌آموز
                        </span>
                        <small>ظرفیت {fa(row.capacity)} نفر</small>
                      </div>
                      <div className="capacity-bar">
                        <span
                          style={{
                            width: `${Math.min(100, ((row.student_count ?? 0) / row.capacity) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className="class-teacher">
                        <Avatar
                          name={
                            lookups.teachers?.find((t) => t.id === row.teacher_id)?.label ||
                            'معلم راهنما'
                          }
                          id={row.teacher_id}
                          size="sm"
                        />
                        <div>
                          <strong>
                            {lookups.teachers?.find((t) => t.id === row.teacher_id)?.label ||
                              'معلم راهنما'}
                          </strong>
                          <small>معلم راهنمای کلاس</small>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="card-detail-fields">
                      {columns.slice(1, 4).map((f) => (
                        <div key={f.name}>
                          <span>{f.label}</span>
                          <strong>
                            <FieldValue field={f} value={row[f.name]} />
                          </strong>
                        </div>
                      ))}
                    </div>
                  )}
                  <button className="resource-card-link" onClick={() => setDetail(row)}>
                    مشاهده {selected === 'students' ? 'پرونده' : def.singular}
                    <Icon name="ArrowUpLeft" size={16} />
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data-table resource-table">
                <thead>
                  <tr>
                    <th className="row-number">ردیف</th>
                    {columns.map((f) => (
                      <th key={f.name}>{f.name === 'first_name' ? def.singular : f.label}</th>
                    ))}
                    <th className="actions-column">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, i) => (
                    <tr key={row.id}>
                      <td className="row-number">{fa((page - 1) * limit + i + 1)}</td>
                      {columns.map((f, ci) => (
                        <td key={f.name}>
                          {ci === 0 ? (
                            ['students', 'teachers'].includes(selected) ? (
                              <button className="person-cell" onClick={() => setDetail(row)}>
                                <Avatar name={resourceLabel(selected, row)} id={row.id} size="sm" />
                                <span>
                                  <strong>{resourceLabel(selected, row)}</strong>
                                  <small>
                                    {selected === 'students'
                                      ? `کد ملی: ${row.national_id?.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]) || '—'}`
                                      : row.qualification || 'همکار آموزشی'}
                                  </small>
                                </span>
                              </button>
                            ) : (
                              <button className="table-title-button" onClick={() => setDetail(row)}>
                                <FieldValue field={f} value={row[f.name]} />
                              </button>
                            )
                          ) : (
                            <FieldValue field={f} value={row[f.name]} />
                          )}
                        </td>
                      ))}
                      <td>
                        <div className="row-actions">
                          <IconButton
                            name="Eye"
                            label={`مشاهده ${def.singular}`}
                            onClick={() => setDetail(row)}
                          />
                          {(row.permissions?.edit ?? (canWrite && can(`${selected}.edit`))) && (
                            <IconButton
                              name="Pencil"
                              label={`ویرایش ${def.singular}`}
                              onClick={() => edit(row)}
                            />
                          )}{' '}
                          {(row.permissions?.delete ?? (canWrite && can(`${selected}.delete`))) && (
                            <IconButton
                              name="Trash2"
                              label={`حذف ${def.singular}`}
                              className="delete-action"
                              onClick={() => setRemove(row)}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <Empty
            title={
              search || Object.values(filters).some(Boolean)
                ? 'موردی با این مشخصات پیدا نشد'
                : `هنوز ${def.singular} ثبت نشده`
            }
            description={
              search
                ? 'فیلترها را تغییر دهید یا عبارت دیگری جست‌وجو کنید.'
                : `با افزودن اولین ${def.singular} این بخش را شروع کنید.`
            }
            icon={def.icon}
            action={
              canWrite && can(`${selected}.create`) && !createBlocked ? (
                <Button icon="Plus" onClick={() => setForm({ row: null })}>
                  افزودن {def.singular}
                </Button>
              ) : null
            }
          />
        )}
        {data && data.total > 0 && (
          <div className="pagination">
            <span>
              نمایش {fa((page - 1) * limit + 1)} تا {fa(Math.min(page * limit, data.total))} از{' '}
              {fa(data.total)} مورد
            </span>
            <div>
              <label>
                در هر صفحه
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={10}>۱۰</option>
                  <option value={20}>۲۰</option>
                  <option value={50}>۵۰</option>
                </select>
              </label>
              <IconButton
                name="ChevronRight"
                label="صفحه قبل"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              />
              <span className="page-number">{fa(page)}</span>
              <span className="page-total">از {fa(data.pages)}</span>
              <IconButton
                name="ChevronLeft"
                label="صفحه بعد"
                disabled={page >= data.pages}
                onClick={() => setPage((p) => p + 1)}
              />
            </div>
          </div>
        )}
      </section>
      {form && (
        <ResourceForm
          key={`${selected}-${form.row?.id || 'new'}`}
          resource={selected}
          row={form.row}
          defaults={form.defaults}
          onClose={() => setForm(null)}
          onSaved={saved}
        />
      )}
      {detail &&
        (selected === 'students' && can('students.profile') ? (
          <StudentProfile id={detail.id} onClose={closeDetail} onEdit={edit} />
        ) : selected === 'classes' ? (
          <ClassDetail row={detail} onClose={closeDetail} onEdit={edit} />
        ) : selected === 'assignments' ? (
          <AssignmentDetail row={detail} onClose={closeDetail} onEdit={edit} />
        ) : selected === 'invoices' ? (
          <InvoiceDetail row={detail} onClose={closeDetail} onEdit={edit} onChanged={refresh} />
        ) : (
          <GenericDetail
            resource={selected}
            row={detail}
            onClose={closeDetail}
            onEdit={edit}
            onDelete={setRemove}
            onAccountCreated={refresh}
          />
        ))}
      {remove && (
        <Confirm
          title={`حذف ${def.singular}`}
          description={`«${resourceLabel(selected, remove)}» حذف شود؟ این عملیات قابل بازگشت نیست. سوابق وابسته مانع حذف می‌شوند؛ برای حفظ سوابق، وضعیت پرونده را غیرفعال کنید.`}
          danger
          confirmLabel="بله، حذف شود"
          onConfirm={erase}
          onClose={() => setRemove(null)}
        />
      )}{' '}
      {account && <Credentials account={account} onClose={() => setAccount(null)} />}{' '}
      {importing && (
        <ImportStudents
          onClose={() => setImporting(false)}
          onSaved={async () => {
            refresh();
            await refreshLookups();
          }}
        />
      )}
    </div>
  );
}
