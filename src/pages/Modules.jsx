import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context';
import { modulePaths } from '../components/Layout';
import { api, fa, describeError } from '../lib/api';
import { featureAvailable } from '../../shared/catalog';
import {
  Badge,
  Button,
  Confirm,
  Empty,
  Icon,
  Modal,
  PageHeader,
  SearchInput,
  Switch,
} from '../components/ui';
export default function Modules() {
  const { config, user, setConfig, toast } = useApp();
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [selected, setSelected] = useState(null),
    [featureSearch, setFeatureSearch] = useState(''),
    [confirm, setConfirm] = useState(null),
    [busy, setBusy] = useState(null),
    [help, setHelp] = useState(false);
  const admin = user.role === 'admin';
  const features = config.features,
    modules = config.modules;
  // Count capabilities that are live for the school, not only for the signed-in role,
  // otherwise admin-only dashboards would look as if student/teacher features were off.
  const featureOn = (id) => {
    const feature = features.find((item) => item.id === id);
    return (
      !!feature?.enabled &&
      !!modules.find((module) => module.id === feature.module)?.enabled &&
      feature.requires.every(featureOn)
    );
  };
  const effective = features.filter((f) => featureOn(f.id)).length;
  const ownEffective = features.filter((f) => featureAvailable(config, user.role, f.id)).length;
  const visible = modules.filter(
    (m) =>
      (filter === 'all' ||
        (filter === 'active' && m.enabled) ||
        (filter === 'inactive' && !m.enabled)) &&
      (`${m.name} ${m.description}`.includes(search) ||
        features.some((f) => f.module === m.id && f.name.includes(search))),
  );
  const change = async (type, id, enabled) => {
    setBusy(id);
    try {
      const result = await api(`/settings/${type}/${id}`, { method: 'PATCH', body: { enabled } });
      setConfig(result);
      toast(enabled ? 'قابلیت فعال شد.' : 'قابلیت غیرفعال شد؛ دسترسی API هم مسدود است.');
    } catch (e) {
      toast(describeError(e), 'error');
      throw e;
    } finally {
      setBusy(null);
    }
  };
  const toggleModule = (m, enabled) => {
    if (!enabled) setConfirm(m);
    else change('modules', m.id, true).catch(() => {});
  };
  const selectedModule = modules.find((m) => m.id === selected);
  return (
    <div className="modules-page page-enter">
      <PageHeader
        title="به اندازهٔ مدرسه شما"
        description="هر قابلیت، یک انتخاب؛ مدرسه‌یار را برای نیاز خودتان تنظیم کنید."
      >
        <Badge tone="purple" className="version-badge">
          <Icon name="Sparkles" size={16} />
          نسخه ۱.۰ · {fa(config.feature_count)} قابلیت
        </Badge>
        <Button variant="secondary" icon="CircleHelp" onClick={() => setHelp(true)}>
          راهنمای ماژول‌ها
        </Button>
      </PageHeader>
      <div className="module-stats">
        <div>
          <span className="stat-icon tone-purple">
            <Icon name="Boxes" size={23} />
          </span>
          <strong>{fa(modules.length)}</strong>
          <span>ماژول یکپارچه</span>
        </div>
        <div>
          <span className="stat-icon tone-green">
            <Icon name="CheckCircle2" size={23} />
          </span>
          <strong>{fa(modules.filter((m) => m.enabled).length)}</strong>
          <span>ماژول فعال</span>
        </div>
        <div>
          <span className="stat-icon tone-blue">
            <Icon name="Sparkles" size={23} />
          </span>
          <strong>{fa(effective)}</strong>
          <span>
            قابلیت فعال {ownEffective !== effective ? `(${fa(ownEffective)} برای نقش شما)` : ''}
          </span>
        </div>
        <div>
          <span className="stat-icon tone-orange">
            <Icon name="CircleOff" size={23} />
          </span>
          <strong>{fa(features.length - effective)}</strong>
          <span>قابلیت غیرفعال</span>
        </div>
      </div>
      <div className="module-toolbar">
        <div className="segmented">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
            همه ماژول‌ها
          </button>
          <button
            className={filter === 'active' ? 'active' : ''}
            onClick={() => setFilter('active')}
          >
            فعال
          </button>
          <button
            className={filter === 'inactive' ? 'active' : ''}
            onClick={() => setFilter('inactive')}
          >
            غیرفعال
          </button>
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="جست‌وجوی ماژول یا قابلیت..."
        />
      </div>
      <div className="module-card-grid">
        {visible.map((m) => {
          const fs = features.filter((f) => f.module === m.id);
          const enabled = fs.filter((f) => f.enabled).length;
          return (
            <article className={`module-card ${!m.enabled ? 'module-disabled' : ''}`} key={m.id}>
              <div className="module-card-top">
                <span className={`module-card-icon tone-${m.color}`}>
                  <Icon name={m.icon} size={25} />
                </span>
                <div>
                  {m.locked ? (
                    <Badge tone="neutral">
                      <Icon name="LockKeyhole" size={12} />
                      هسته سامانه
                    </Badge>
                  ) : (
                    <Switch
                      enabled={m.enabled}
                      disabled={!admin || busy === m.id}
                      label={`${m.enabled ? 'غیرفعال' : 'فعال'} کردن ${m.name}`}
                      onChange={(e) => toggleModule(m, e)}
                    />
                  )}
                </div>
              </div>
              <h2>{m.name}</h2>
              <p>{m.description}</p>
              <div className="module-card-meta">
                <Badge tone={m.enabled ? 'green' : 'neutral'} dot>
                  {m.enabled ? 'فعال' : 'غیرفعال'}
                </Badge>
                <span>
                  {fa(m.enabled ? enabled : 0)} از {fa(fs.length)} قابلیت فعال
                </span>
              </div>
              <div className="module-card-footer">
                <button
                  onClick={() => {
                    setSelected(m.id);
                    setFeatureSearch('');
                  }}
                >
                  مدیریت قابلیت‌ها
                  <Icon name="SlidersHorizontal" size={16} />
                </button>
                {m.enabled && modulePaths[m.id] && (
                  <Link to={modulePaths[m.id]} aria-label={`ورود به ${m.name}`}>
                    <Icon name="ArrowUpLeft" size={18} />
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!visible.length && (
        <div className="panel">
          <Empty
            title="ماژولی پیدا نشد"
            description="عبارت جست‌وجو یا وضعیت فیلتر را تغییر دهید."
            icon="Boxes"
          />
        </div>
      )}
      <div className="modules-bottom-note">
        <Icon name="ShieldCheck" size={19} />
        <p>
          غیرفعال‌سازی فقط ظاهری نیست؛ عملیات آن قابلیت در سمت سرور نیز مسدود می‌شود. اطلاعات قبلی
          حذف نمی‌شوند.
        </p>
      </div>
      {selectedModule && (
        <Modal
          title={`قابلیت‌های ${selectedModule.name}`}
          subtitle={`${fa(features.filter((f) => f.module === selected).length)} قابلیت مستقل؛ کنترل در رابط و API`}
          wide
          onClose={() => setSelected(null)}
        >
          <div className="modal-body">
            <div className="feature-modal-banner">
              <span className={`stat-icon tone-${selectedModule.color}`}>
                <Icon name={selectedModule.icon} size={25} />
              </span>
              <p>
                {selectedModule.enabled
                  ? 'هر قابلیت را جداگانه فعال یا غیرفعال کنید.'
                  : 'ماژول اصلی غیرفعال است؛ برای استفاده ابتدا خود ماژول را فعال کنید.'}
              </p>
              {!selectedModule.enabled && admin && (
                <Button
                  loading={busy === selectedModule.id}
                  onClick={() => change('modules', selectedModule.id, true).catch(() => {})}
                >
                  فعال کردن ماژول
                </Button>
              )}
            </div>
            <SearchInput
              value={featureSearch}
              onChange={setFeatureSearch}
              placeholder="جست‌وجوی قابلیت..."
            />
            <div className="feature-list">
              {features
                .filter((f) => f.module === selected && f.name.includes(featureSearch))
                .map((f, i) => (
                  <div key={f.id} className={!selectedModule.enabled ? 'feature-disabled' : ''}>
                    <span className="feature-index">{fa(i + 1)}</span>
                    <div>
                      <strong>{f.name}</strong>
                      <small dir="ltr">{f.id}</small>
                    </div>
                    {f.locked ? (
                      <Badge>
                        <Icon name="LockKeyhole" size={12} />
                        ضروری
                      </Badge>
                    ) : (
                      <Switch
                        enabled={f.enabled}
                        disabled={!admin || busy === f.id}
                        label={`${f.enabled ? 'غیرفعال' : 'فعال'} کردن ${f.name}`}
                        onChange={(e) => change('features', f.id, e).catch(() => {})}
                      />
                    )}
                  </div>
                ))}
            </div>
            <div className="info-box">
              <Icon name="Info" size={19} />
              <span>
                فرم‌های وابسته به یک بخش ممکن است به انتخاب‌گرهای اطلاعات آن نیاز داشته باشند.
                مدیریت ماژول‌ها و احراز هویت برای جلوگیری از قفل شدن سامانه همیشه در دسترس‌اند.
              </span>
            </div>
          </div>
          <footer className="modal-footer">
            <Button variant="secondary" onClick={() => setSelected(null)}>
              پایان تنظیمات
            </Button>
          </footer>
        </Modal>
      )}
      {confirm && (
        <Confirm
          title={`غیرفعال کردن ${confirm.name}`}
          description={`تمام ${fa(features.filter((f) => f.module === confirm.id).length)} قابلیت این ماژول از پنل‌ها خارج و در API مسدود می‌شوند. هیچ داده‌ای حذف نمی‌شود و هر زمان می‌توانید دوباره فعالش کنید.`}
          confirmLabel="غیرفعال شود"
          onConfirm={() => change('modules', confirm.id, false)}
          onClose={() => setConfirm(null)}
        />
      )}{' '}
      {help && (
        <Modal title="یک سیستم، به انتخاب شما" onClose={() => setHelp(false)}>
          <div className="modal-body help-content">
            <section>
              <h3>ماژول و قابلیت چه تفاوتی دارند؟</h3>
              <p>
                ماژول یک حوزه مثل آموزش است. قابلیت یک عملیات واقعی مثل ثبت نمره یا تحویل تکلیف است.
                کلید ماژول همه قابلیت‌های آن را هم‌زمان کنترل می‌کند.
              </p>
            </section>
            <section>
              <h3>داده‌ها چه می‌شوند؟</h3>
              <p>
                خاموش شدن ماژول داده‌ها را حذف نمی‌کند. پس از فعال‌سازی مجدد، سوابق قبلی
                بازمی‌گردند.
              </p>
            </section>
            <section>
              <h3>آیا دانش‌آموز می‌تواند همه‌چیز را ببیند؟</h3>
              <p>
                خیر. فعال بودن قابلیت جایگزین مجوز نقش نیست؛ دانش‌آموز فقط پرونده خود و معلم فقط
                کلاس‌های تخصیص‌یافته‌اش را مدیریت می‌کند.
              </p>
            </section>
            <section>
              <h3>۱۳۴ قابلیت چطور شمرده شده‌اند؟</h3>
              <p>
                ۱۰۰ عملیات مستقل مشاهده، ثبت، ویرایش و حذف ایمن در ۲۵ نوع پرونده، به‌علاوه ۳۴ قابلیت
                حضور، تیکت، تکلیف، گزارش و مدیریت. فهرست کامل در docs/FEATURES.md قرار دارد.
              </p>
            </section>
          </div>
          <footer className="modal-footer">
            <Button onClick={() => setHelp(false)}>متوجه شدم</Button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
