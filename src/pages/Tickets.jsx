import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { roles } from '../../shared/catalog';
import { useApp, useApi } from '../context';
import {
  api,
  dateFa,
  describeError,
  fa,
  labelMap,
  query,
  relativeDate,
  timeFa,
  upload,
} from '../lib/api';
import {
  Avatar,
  Badge,
  Button,
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
const categories = {
  general: 'عمومی',
  education: 'آموزشی',
  administrative: 'اداری',
  finance: 'مالی',
  services: 'خدمات',
};
function NewTicket({ onClose, onSaved }) {
  const { can, toast } = useApp();
  const { data: recipients, loading, error } = useApi('/tickets/recipients');
  const [values, setValues] = useState({
      title: '',
      recipient_id: '',
      category: 'general',
      priority: 'normal',
      body: '',
    }),
    [file, setFile] = useState(null),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const uploaded = file ? await upload(file, 'tickets') : null;
      const result = await api('/tickets', {
        method: 'POST',
        body: {
          ...values,
          recipient_id: Number(values.recipient_id),
          file_id: uploaded?.id || null,
        },
      });
      toast('تیکت شما ارسال شد.');
      onSaved(result.id);
      onClose();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const update = (name, value) => setValues((v) => ({ ...v, [name]: value }));
  return (
    <Modal
      title="یک گفت‌وگوی تازه"
      subtitle="پیام شما فقط برای گیرنده و مدیر مدرسه قابل مشاهده است."
      wide
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          {(error || formError) && <ErrorBox error={formError || error} />}
          <div className="form-grid">
            <label className="form-field full-width">
              موضوع تیکت<span className="required-star">*</span>
              <input
                required
                minLength={3}
                maxLength={200}
                value={values.title}
                onChange={(e) => update('title', e.target.value)}
                placeholder="موضوع پیام را کوتاه و روشن بنویسید"
              />
            </label>
            <label className="form-field">
              گیرنده<span className="required-star">*</span>
              <select
                required
                value={values.recipient_id}
                onChange={(e) => update('recipient_id', e.target.value)}
                disabled={loading}
              >
                <option value="">انتخاب مدیر یا معلم...</option>
                {recipients?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.full_name} · {roles[r.role]}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              دسته‌بندی
              <select value={values.category} onChange={(e) => update('category', e.target.value)}>
                {Object.entries(categories).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              اولویت
              <select value={values.priority} onChange={(e) => update('priority', e.target.value)}>
                <option value="low">{labelMap.low}</option>
                <option value="normal">{labelMap.normal}</option>
                <option value="high">{labelMap.high}</option>
              </select>
            </label>
            <label className="form-field full-width">
              متن پیام<span className="required-star">*</span>
              <textarea
                required
                minLength={3}
                maxLength={10000}
                rows={5}
                value={values.body}
                onChange={(e) => update('body', e.target.value)}
                placeholder="چطور می‌توانیم کمکتان کنیم؟"
              />
            </label>
          </div>
          {can('tickets.attachments') && (
            <label className="attachment-chooser">
              <Icon name="Paperclip" size={18} />
              {file ? file.name : 'افزودن فایل پیوست (حداکثر ۵ مگابایت)'}
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx"
                onChange={(e) => setFile(e.target.files[0] || null)}
              />
            </label>
          )}
        </div>
        <footer className="modal-footer">
          <Button type="submit" icon="Send" loading={busy}>
            ارسال تیکت
          </Button>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
export default function Tickets() {
  const { user, can, toast, refreshNotifications } = useApp();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState(''),
    [search, setSearch] = useState(''),
    [debounced, setDebounced] = useState(''),
    [newTicket, setNewTicket] = useState(false),
    [reply, setReply] = useState(''),
    [file, setFile] = useState(null),
    [busy, setBusy] = useState(false),
    [managing, setManaging] = useState(false),
    [mobileDetail, setMobileDetail] = useState(false);
  const {
    data: allTickets,
    loading,
    error,
    refresh,
  } = useApi(can('tickets.view') ? `/tickets?${query({ q: debounced })}` : null);
  const tickets = allTickets ? allTickets.filter((t) => !filter || t.status === filter) : null;
  const selected = Number(params.get('id')) || tickets?.[0]?.id;
  const conversation = useApi(selected && can('tickets.view') ? `/tickets/${selected}` : null);
  const bottom = useRef(null),
    attachmentInput = useRef(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    setReply('');
    setFile(null);
  }, [selected]);
  useEffect(() => {
    if (conversation.data) bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [conversation.data]);
  const select = (id) => {
    setParams({ id });
    setMobileDetail(true);
  };
  const send = async (e) => {
    e.preventDefault();
    if (!reply.trim() || busy) return;
    setBusy(true);
    try {
      const uploaded = file ? await upload(file, 'tickets') : null;
      await api(`/tickets/${selected}/messages`, {
        method: 'POST',
        body: { body: reply, file_id: uploaded?.id || null },
      });
      setReply('');
      setFile(null);
      conversation.refresh();
      refresh();
      if (can('notifications.view')) await refreshNotifications();
      toast('پاسخ شما ارسال شد.');
    } catch (e) {
      toast(describeError(e), 'error');
      conversation.refresh();
      refresh();
    } finally {
      setBusy(false);
    }
  };
  const changeStatus = async (status) => {
    setManaging(true);
    try {
      await api(`/tickets/${selected}`, { method: 'PATCH', body: { status } });
      conversation.refresh();
      refresh();
      toast('وضعیت تیکت به‌روز شد.');
    } catch (e) {
      toast(describeError(e), 'error');
      conversation.refresh();
    } finally {
      setManaging(false);
    }
  };
  if (!can('tickets.view'))
    return (
      <Empty
        title="تیکت‌ها غیرفعال شده‌اند"
        description="مدیر می‌تواند ارتباط از طریق تیکت را فعال کند."
        icon="MessagesSquare"
      />
    );
  const ticket = conversation.data?.ticket;
  const stats = (allTickets || []).reduce((a, t) => {
    a[t.status] = (a[t.status] || 0) + 1;
    return a;
  }, {});
  return (
    <div className="tickets-page page-enter">
      <PageHeader
        title="پیام‌ها و تیکت‌ها"
        description="ارتباطی نزدیک‌تر، پیگیری شفاف‌تر؛ هیچ پیامی گم نمی‌شود."
      >
        {can('tickets.create') && (
          <Button icon="Plus" onClick={() => setNewTicket(true)}>
            تیکت جدید
          </Button>
        )}
      </PageHeader>
      <div className="ticket-overview">
        {[
          ['open', 'باز', 'MessageCircle', 'purple'],
          ['in_progress', 'در حال بررسی', 'Clock3', 'orange'],
          ['resolved', 'پاسخ داده‌شده', 'CheckCheck', 'green'],
        ].map(([s, l, i, c]) => (
          <button
            key={s}
            className={`ticket-overview-card ${filter === s ? 'selected' : ''}`}
            onClick={() => {
              setFilter(filter === s ? '' : s);
              setParams({});
            }}
          >
            <span className={`small-icon tone-${c}`}>
              <Icon name={i} size={21} />
            </span>
            <strong>{fa(stats[s] || 0)}</strong>
            <span>{l}</span>
          </button>
        ))}
        <div className="ticket-privacy">
          <Icon name="LockKeyhole" size={22} />
          <span>گفت‌وگوهای شما خصوصی هستند</span>
        </div>
      </div>
      <section className={`panel ticket-workspace ${mobileDetail ? 'show-detail' : ''}`}>
        <aside className="ticket-inbox">
          <div className="inbox-header">
            <h2>
              صندوق تیکت‌ها <Badge>{fa(tickets?.length)}</Badge>
            </h2>
            <IconButton name="RefreshCw" label="تازه‌سازی تیکت‌ها" onClick={refresh} />
          </div>
          <SearchInput value={search} onChange={setSearch} placeholder="جست‌وجوی تیکت..." />
          <div className="inbox-filters">
            <button
              className={!filter ? 'active' : ''}
              onClick={() => {
                setFilter('');
                setParams({});
              }}
            >
              همه
            </button>
            <button
              className={filter === 'open' ? 'active' : ''}
              onClick={() => {
                setFilter('open');
                setParams({});
              }}
            >
              باز
            </button>
            <button
              className={filter === 'in_progress' ? 'active' : ''}
              onClick={() => {
                setFilter('in_progress');
                setParams({});
              }}
            >
              در حال بررسی
            </button>
            <button
              className={filter === 'resolved' ? 'active' : ''}
              onClick={() => {
                setFilter('resolved');
                setParams({});
              }}
            >
              پاسخ داده‌شده
            </button>
          </div>
          <div className="ticket-inbox-list">
            {error ? (
              <ErrorBox error={error} onRetry={refresh} />
            ) : loading && !tickets ? (
              <Loading rows={4} />
            ) : tickets?.length ? (
              tickets.map((t) => (
                <button
                  key={t.id}
                  className={`ticket-preview ${selected === t.id ? 'active' : ''}`}
                  onClick={() => select(t.id)}
                >
                  <div className="ticket-preview-top">
                    <Avatar name={t.sender_name} id={t.sender_id} size="sm" />
                    <strong>{t.sender_name}</strong>
                    <small>{relativeDate(t.updated_at)}</small>
                  </div>
                  <h3>{t.title}</h3>
                  <div className="ticket-preview-bottom">
                    <Badge tone={statusTone(t.status)} dot>
                      {labelMap[t.status]}
                    </Badge>
                    <span>
                      <Icon name="MessageCircle" size={13} />
                      {fa(t.message_count)} پیام
                    </span>
                    <small>#{fa(t.id)}</small>
                  </div>
                </button>
              ))
            ) : (
              <Empty
                title="تیکتی پیدا نشد"
                description="از «تیکت جدید» یک گفت‌وگو را شروع کنید."
                icon="MessagesSquare"
              />
            )}
          </div>
        </aside>
        <div className="ticket-conversation">
          {conversation.error ? (
            <div className="panel-padding">
              <ErrorBox error={conversation.error} onRetry={conversation.refresh} />
            </div>
          ) : conversation.loading && !conversation.data ? (
            <Loading rows={5} />
          ) : ticket ? (
            <>
              <header className="conversation-header">
                <IconButton
                  name="ChevronRight"
                  label="بازگشت به صندوق"
                  className="mobile-back"
                  onClick={() => setMobileDetail(false)}
                />
                <div>
                  <h2>{ticket.title}</h2>
                  <p>
                    <span>تیکت #{fa(ticket.id)}</span>
                    <span>·</span>
                    {categories[ticket.category]}
                    <span>·</span>گیرنده: {ticket.recipient_name}
                  </p>
                </div>
                {can('tickets.manage') &&
                (user.role === 'admin' || user.id === ticket.recipient_id) ? (
                  <select
                    className="select select-sm"
                    aria-label="وضعیت تیکت"
                    disabled={managing}
                    value={ticket.status}
                    onChange={(e) => changeStatus(e.target.value)}
                  >
                    {['open', 'in_progress', 'resolved', 'closed'].map((s) => (
                      <option key={s} value={s}>
                        {labelMap[s]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Badge tone={statusTone(ticket.status)} dot>
                    {labelMap[ticket.status]}
                  </Badge>
                )}
              </header>
              <div className="conversation-body">
                <div className="conversation-start">
                  <Icon name="ShieldCheck" size={14} />
                  شروع گفت‌وگو · {dateFa(ticket.created_at)}
                </div>
                {conversation.data.messages.map((m) => (
                  <div
                    className={`message-row ${m.sender_id === user.id ? 'from-me' : ''}`}
                    key={m.id}
                  >
                    <Avatar name={m.full_name} id={m.sender_id} size="sm" />
                    <div className="message-content">
                      <div className="message-meta">
                        <strong>{m.sender_id === user.id ? 'شما' : m.full_name}</strong>
                        <span>{roles[m.role]}</span>
                      </div>
                      <div className="message-bubble">
                        <p>{m.body}</p>
                        {m.file_id && can('tickets.attachments') && (
                          <a
                            className="message-attachment"
                            href={`/api/files/${m.file_id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Icon name="FileText" size={20} />
                            {m.file_name}
                            <Icon name="Download" size={16} />
                          </a>
                        )}
                      </div>
                      <small>
                        {dateFa(m.created_at, { day: 'numeric', month: 'short' })}،{' '}
                        {timeFa(m.created_at)}
                        {m.sender_id === user.id && <Icon name="CheckCheck" size={13} />}
                      </small>
                    </div>
                  </div>
                ))}
                <div ref={bottom} />
              </div>
              {ticket.status === 'closed' ? (
                <div className="closed-ticket-note">
                  <Icon name="LockKeyhole" size={18} />
                  این تیکت بسته شده است. گیرنده یا مدیر می‌تواند آن را دوباره باز کند.
                </div>
              ) : can('tickets.reply') ? (
                <form className="reply-form" onSubmit={send}>
                  <textarea
                    aria-label="متن پاسخ تیکت"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={3}
                    required
                    maxLength={10000}
                    placeholder="پاسخ خود را بنویسید..."
                  />
                  <div className="reply-form-bottom">
                    <div>
                      {can('tickets.attachments') && (
                        <>
                          <IconButton
                            name="Paperclip"
                            label="افزودن پیوست"
                            onClick={() => attachmentInput.current?.click()}
                          />
                          <input
                            ref={attachmentInput}
                            type="file"
                            hidden
                            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx"
                            onChange={(e) => {
                              setFile(e.target.files[0] || null);
                              e.target.value = '';
                            }}
                          />
                        </>
                      )}
                      {file && (
                        <span className="attachment-name">
                          <Icon name="FileText" size={14} />
                          {file.name}
                          <IconButton name="X" label="حذف پیوست" onClick={() => setFile(null)} />
                        </span>
                      )}
                    </div>
                    <Button type="submit" icon="Send" loading={busy} disabled={!reply.trim()}>
                      ارسال پاسخ
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="closed-ticket-note">پاسخ به تیکت توسط مدیر غیرفعال شده است.</div>
              )}
            </>
          ) : (
            <Empty
              title="یک گفت‌وگو را انتخاب کنید"
              description="پیام‌های مدرسه و پاسخ‌های شما اینجا نمایش داده می‌شود."
              icon="MessagesSquare"
            />
          )}
        </div>
      </section>
      {newTicket && (
        <NewTicket
          onClose={() => setNewTicket(false)}
          onSaved={(id) => {
            refresh();
            select(id);
            if (can('notifications.view')) refreshNotifications().catch(() => {});
          }}
        />
      )}
    </div>
  );
}
