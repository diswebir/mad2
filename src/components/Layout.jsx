import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp, useApi } from '../context';
import { roles } from '../../shared/catalog';
import { api, fa, dateFa, relativeDate } from '../lib/api';
import {
  Avatar,
  Badge,
  Button,
  Empty,
  ErrorBox,
  ErrorReportButton,
  Icon,
  IconButton,
  Modal,
  SearchInput,
} from './ui';
const paths = [
  { to: '/', name: 'داشبورد', icon: 'LayoutDashboard', module: 'dashboard' },
  { to: '/students', name: 'دانش‌آموزان', icon: 'GraduationCap', module: 'students' },
  {
    to: '/teachers',
    name: 'معلمان',
    icon: 'UsersRound',
    module: 'teachers',
    roles: ['admin', 'teacher'],
  },
  { to: '/classes', name: 'کلاس‌ها', icon: 'School', module: 'classes' },
  { to: '/attendance', name: 'حضور و غیاب', icon: 'CalendarCheck2', module: 'attendance' },
  { to: '/education', name: 'آموزش و نمرات', icon: 'BookOpen', module: 'education' },
  { to: '/meetings', name: 'ملاقات اولیا', icon: 'CalendarClock', module: 'meetings' },
  { to: '/tickets', name: 'پیام‌ها و تیکت‌ها', icon: 'MessagesSquare', module: 'tickets' },
  { to: '/calendar', name: 'تقویم و رویدادها', icon: 'CalendarDays', module: 'calendar' },
  {
    to: '/finance',
    name: 'امور مالی',
    icon: 'Wallet',
    module: 'finance',
    roles: ['admin', 'student', 'parent'],
  },
  { to: '/reports', name: 'گزارش‌ها', icon: 'ChartNoAxesCombined', module: 'reports' },
];
export const modulePaths = {
  dashboard: '/',
  students: '/students',
  teachers: '/teachers',
  classes: '/classes',
  attendance: '/attendance',
  meetings: '/meetings',
  education: '/education',
  tickets: '/tickets',
  announcements: '/announcements',
  calendar: '/calendar',
  finance: '/finance',
  library: '/library',
  services: '/services',
  reports: '/reports',
  settings: '/settings',
  profile: '/profile',
  notifications: '/notifications',
};
export function HelpDialog({ onClose }) {
  const navigate = useNavigate();
  return (
    <Modal title="کنار شما، در هر قدم" subtitle="راهنمای سریع مدرسه‌یار" onClose={onClose}>
      <div className="modal-body help-content">
        <div className="help-welcome">
          <Icon name="CircleHelp" size={34} />
          <p>همه‌چیز برای یک روز منظم‌تر در مدرسه.</p>
        </div>
        {[
          [
            '۱. مدرسه را آماده کنید',
            'از تنظیمات، نام مدرسه و سال تحصیلی را وارد کنید. در بخش ماژول‌ها، فقط امکانات مورد نیازتان را فعال نگه دارید.',
          ],
          [
            '۲. کلاس و حساب‌ها را بسازید',
            'اول معلم، سپس کلاس و بعد دانش‌آموز را اضافه کنید. حساب‌های جدید با رمز موقت و الزام تغییر رمز ساخته می‌شوند.',
          ],
          [
            '۳. حضور و غیاب را ثبت کنید',
            'کلاس و تاریخ را انتخاب کنید، وضعیت‌ها را مشخص کنید و «ذخیره تغییرات» را بزنید. غیبت به دانش‌آموز و ولی دارای حساب اطلاع داده می‌شود.',
          ],
          [
            '۴. ارتباط را در تیکت نگه دارید',
            'دانش‌آموز فقط به مدیر و معلمان کلاس خودش پیام می‌دهد. گفت‌وگوها و فایل‌ها برای دیگران قابل مشاهده نیست.',
          ],
          [
            'نصب روی cPanel',
            'هاست باید Setup Node.js App و Node.js ۲۰ یا بالاتر داشته باشد. راهنمای کامل داخل docs/CPANEL.md است. هاست صرفاً PHP مناسب نیست.',
          ],
        ].map(([title, text]) => (
          <section key={title}>
            <h3>{title}</h3>
            <p>{text}</p>
          </section>
        ))}
      </div>
      <footer className="modal-footer">
        <Button
          icon="Rocket"
          onClick={() => {
            onClose();
            navigate('/install');
          }}
        >
          ویزارد نصب
        </Button>
        <Button variant="secondary" onClick={onClose}>
          متوجه شدم
        </Button>
      </footer>
    </Modal>
  );
}
function GlobalSearch({ onClose }) {
  const [value, setValue] = useState(''),
    [debounced, setDebounced] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), 230);
    return () => clearTimeout(t);
  }, [value]);
  const { data, loading, error } = useApi(
    debounced.length >= 2 ? `/search?q=${encodeURIComponent(debounced)}` : null,
  );
  return (
    <Modal
      title="جست‌وجو در مدرسه"
      subtitle="دانش‌آموز، معلم، کلاس، رویداد یا تیکت را پیدا کنید."
      onClose={onClose}
    >
      <div className="modal-body">
        <SearchInput
          value={value}
          onChange={setValue}
          placeholder="نام یا عنوان را بنویسید..."
          className="global-search-input"
        />
        {error && <ErrorBox error={error} />}
        {loading ? (
          <div className="search-hint">
            <Icon name="LoaderCircle" className="spin" />
            در حال جست‌وجو...
          </div>
        ) : data?.length ? (
          <div className="search-results">
            {data.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  navigate(item.link);
                  onClose();
                }}
              >
                <span className="search-result-icon">
                  <Icon name="Search" size={18} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.category}</span>
                </div>
                <Icon name="ArrowUpLeft" size={18} />
              </button>
            ))}
          </div>
        ) : (
          <Empty
            title={debounced.length >= 2 ? 'نتیجه‌ای پیدا نشد' : 'چه چیزی را پیدا کنیم؟'}
            description={
              debounced.length >= 2
                ? 'عبارت کوتاه‌تر یا نام دیگری را امتحان کنید.'
                : 'حداقل دو حرف بنویسید؛ فقط نتایج مجاز برای حساب شما نمایش داده می‌شود.'
            }
            icon="Search"
          />
        )}
      </div>
    </Modal>
  );
}
export default function Layout() {
  const {
    user,
    session,
    config,
    can,
    moduleOn,
    logout,
    switchRole,
    notifications,
    refreshNotifications,
    markNotifications,
    notificationChanged,
    toast,
  } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false),
    [search, setSearch] = useState(false),
    [help, setHelp] = useState(false),
    [dropdown, setDropdown] = useState(null),
    [roleBusy, setRoleBusy] = useState(false),
    [more, setMore] = useState(false);
  const location = useLocation(),
    navigate = useNavigate(),
    dropdownRef = useRef();
  useEffect(() => {
    setMobileOpen(false);
    setDropdown(null);
    if (location.state?.denied)
      toast('این بخش برای نقش شما یا با تنظیمات فعلی در دسترس نیست.', 'error');
  }, [location.pathname, location.state, toast]);
  useEffect(() => {
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearch((s) => !s);
      }
      if (e.key === 'Escape') {
        setMobileOpen(false);
        setDropdown(null);
      }
    };
    const click = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdown(null);
    };
    document.addEventListener('keydown', key);
    document.addEventListener('mousedown', click);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('mousedown', click);
    };
  }, []);
  const school = config.school;
  const unread = notifications.unread;
  const markOne = async (item) => {
    if (item.is_read) return;
    try {
      await markNotifications(item.id);
    } catch (error) {
      toast(error.message, 'error');
    }
  };
  const current =
    paths.find((p) => p.to === location.pathname)?.name ||
    {
      '/modules': 'ماژول‌ها و قابلیت‌ها',
      '/settings': 'تنظیمات سامانه',
      '/library': 'کتابخانه',
      '/services': 'خدمات مدرسه',
      '/announcements': 'اطلاعیه‌ها',
      '/profile': 'حساب کاربری',
      '/notifications': 'اعلان‌ها',
    }[location.pathname] ||
    'مدرسه‌یار';
  const markRead = async () => {
    try {
      await markNotifications();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  const changeRole = async (role) => {
    setRoleBusy(true);
    try {
      await switchRole(role);
      navigate('/');
      setDropdown(null);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setRoleBusy(false);
    }
  };
  return (
    <div className="app-shell">
      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="بستن منو"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <Link to="/" className="brand">
          <span className="brand-icon">
            <Icon name="GraduationCap" size={29} />
          </span>
          <div>
            <strong>
              مدرسه‌یار<span className="brand-dot">.</span>
            </strong>
            <span>مدیریت هوشمند مدرسه</span>
          </div>
        </Link>
        <div className="school-switch">
          <span className="school-icon">
            <Icon name="School" size={23} />
          </span>
          <div>
            <strong>{school.name}</strong>
            <small>
              {school.city || 'مدرسه شما'} · سال {school.academic_year}
            </small>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="منوی اصلی">
          <span className="nav-label">فضای کاری</span>
          {paths
            .filter((p) => moduleOn(p.module) && (!p.roles || p.roles.includes(user.role)))
            .map((p, i) => (
              <React.Fragment key={p.to}>
                {i === 9 && <div className="nav-divider" />}
                <NavLink
                  to={
                    p.to === '/students' && ['student', 'parent'].includes(user.role)
                      ? `/students?id=${user.student_id}`
                      : p.to
                  }
                  end={p.to === '/'}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <Icon name={p.icon} size={21} />
                  <span>
                    {p.to === '/students' && ['student', 'parent'].includes(user.role)
                      ? 'پرونده دانش‌آموز'
                      : p.name}
                  </span>
                  {p.to === '/tickets' && unread > 0 && (
                    <span className="nav-count">{fa(unread)}</span>
                  )}
                  {p.to === '/education' && (
                    <Icon name="ChevronLeft" size={14} className="nav-chevron" />
                  )}
                </NavLink>
              </React.Fragment>
            ))}
          <button
            className={`nav-item nav-more ${more ? 'expanded' : ''}`}
            onClick={() => setMore(!more)}
          >
            <Icon name="LayoutGrid" size={21} />
            <span>سایر بخش‌ها</span>
            <Icon name={more ? 'ChevronUp' : 'ChevronDown'} size={14} className="nav-chevron" />
          </button>
          {more && (
            <div className="nav-extra">
              {[
                ['library', 'کتابخانه', 'Library'],
                ['services', 'خدمات مدرسه', 'Boxes'],
                ['announcements', 'اطلاعیه‌ها', 'Megaphone'],
              ]
                .filter(([m]) => moduleOn(m))
                .map(([m, name, icon]) => (
                  <NavLink className="nav-item" to={modulePaths[m]} key={m}>
                    <Icon name={icon} size={19} />
                    <span>{name}</span>
                  </NavLink>
                ))}
            </div>
          )}
          {user.role === 'admin' && (
            <>
              <div className="nav-divider" />
              <span className="nav-label">مدیریت سامانه</span>
              <NavLink className="nav-item" to="/modules">
                <Icon name="Boxes" size={21} />
                <span>ماژول‌ها و قابلیت‌ها</span>
                <span className="nav-count neutral">{fa(config.feature_count)}</span>
              </NavLink>
              <NavLink className="nav-item" to="/settings">
                <Icon name="Settings2" size={21} />
                <span>تنظیمات</span>
              </NavLink>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <button className="support-card" onClick={() => setHelp(true)}>
            <span className="support-icon">
              <Icon name="CircleHelp" size={25} />
            </span>
            <div>
              <strong>همراه شما هستیم</strong>
              <small>راهنمای استفاده از مدرسه‌یار</small>
            </div>
            <Icon name="ArrowUpLeft" size={17} />
          </button>
          <ErrorReportButton />
          <div className="sidebar-version">
            <span>
              <i />
              سامانه آماده است
            </span>
            <span>نسخه ۱.۲.۰</span>
          </div>
          <a
            className="sidebar-vendor"
            href="https://disweb.ir"
            target="_blank"
            rel="noreferrer"
            dir="ltr"
          >
            ساختهٔ شرکت دیس وب · disweb.ir
          </a>
        </div>
      </aside>
      <header className="topbar">
        <div className="topbar-right">
          <IconButton
            name="Menu"
            label="باز کردن منو"
            className="mobile-menu"
            onClick={() => setMobileOpen(!mobileOpen)}
          />
          <div className="breadcrumbs">
            <span>پنل {roles[user.role]}</span>
            <Icon name="ChevronLeft" size={13} />
            <strong>{current}</strong>
          </div>
        </div>
        <button className="topbar-search" onClick={() => setSearch(true)}>
          <Icon name="Search" size={19} />
          <span>جست‌وجو در مدرسه...</span>
          <kbd dir="ltr">Ctrl K</kbd>
        </button>
        <div className="topbar-actions" ref={dropdownRef}>
          <span className="academic-pill">
            <Icon name="CalendarDays" size={16} />
            {school.academic_year}
          </span>
          {can('notifications.view') && (
            <div className="dropdown-host">
              <button
                className={`notification-button icon-button ${dropdown === 'notifications' ? 'selected' : ''}`}
                aria-label="نمایش اعلان‌ها"
                onClick={async () => {
                  setDropdown(dropdown === 'notifications' ? null : 'notifications');
                  try {
                    await refreshNotifications();
                  } catch (e) {
                    toast(e.message, 'error');
                  }
                }}
              >
                <Icon name="Bell" size={21} />
                {unread > 0 && <i />}
              </button>
              {dropdown === 'notifications' && (
                <div className="dropdown notifications-dropdown">
                  <div className="dropdown-heading">
                    <strong>
                      اعلان‌های شما <Badge tone="purple">{fa(unread)} جدید</Badge>
                    </strong>
                    {can('notifications.read') && unread > 0 && (
                      <button onClick={markRead}>خواندن همه</button>
                    )}
                  </div>
                  {notifications.items.length ? (
                    notifications.items.slice(0, 5).map((n) => (
                      <button
                        className={`notification-item ${!n.is_read ? 'unread' : ''}`}
                        key={n.id}
                        onClick={async () => {
                          await markOne(n);
                          navigate(n.link || '/');
                          setDropdown(null);
                        }}
                      >
                        <span className="notification-item-icon">
                          <Icon
                            name={
                              n.type === 'ticket'
                                ? 'MessageCircle'
                                : n.type === 'attendance'
                                  ? 'CalendarCheck2'
                                  : 'Bell'
                            }
                            size={19}
                          />
                        </span>
                        <div>
                          <strong>{n.title}</strong>
                          <p>{n.body}</p>
                          <small>{relativeDate(n.created_at)}</small>
                        </div>
                      </button>
                    ))
                  ) : (
                    <Empty
                      title="اعلان جدیدی ندارید"
                      description="خبرهای جدید مدرسه اینجا نمایش داده می‌شود."
                      icon="Bell"
                    />
                  )}
                  <button
                    className="dropdown-footer"
                    onClick={() => {
                      notificationChanged();
                      navigate('/notifications');
                      setDropdown(null);
                    }}
                  >
                    مشاهده همه اعلان‌ها
                    <Icon name="ChevronLeft" size={16} />
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="topbar-separator" />
          <div className="dropdown-host">
            <button
              className="profile-button"
              onClick={() => setDropdown(dropdown === 'profile' ? null : 'profile')}
              aria-expanded={dropdown === 'profile'}
            >
              <Avatar name={user.full_name} id={user.id} size="md" />
              <span>
                <strong>{user.full_name}</strong>
                <small>
                  {roles[user.role]}
                  {session.demo ? ' · دمو' : ''}
                </small>
              </span>
              <Icon name="ChevronDown" size={14} />
            </button>
            {dropdown === 'profile' && (
              <div className="dropdown profile-dropdown">
                <div className="dropdown-heading">
                  <span>حساب {user.username}</span>
                </div>
                {['student', 'teacher', 'parent'].includes(user.role) && (
                  <p className="dropdown-note">
                    نام و مشخصات این حساب با پرونده رسمی مدرسه همگام می‌شود.
                  </p>
                )}
                <button
                  onClick={() => {
                    navigate('/profile');
                    setDropdown(null);
                  }}
                >
                  <Icon name="CircleUserRound" size={18} />
                  تنظیمات حساب
                </button>
                <button
                  onClick={() => {
                    setHelp(true);
                    setDropdown(null);
                  }}
                >
                  <Icon name="CircleHelp" size={18} />
                  راهنما و راه‌اندازی
                </button>
                {session.demo && (
                  <div className="demo-role-menu">
                    <span>پنل‌های نسخه نمایشی</span>
                    {Object.entries(roles).map(([role, name]) => (
                      <button
                        key={role}
                        disabled={roleBusy}
                        className={role === user.role ? 'current-role' : ''}
                        onClick={() => changeRole(role)}
                      >
                        <Icon
                          name={
                            role === 'admin'
                              ? 'ShieldCheck'
                              : role === 'teacher'
                                ? 'UsersRound'
                                : role === 'parent'
                                  ? 'HeartHandshake'
                                  : 'GraduationCap'
                          }
                          size={18}
                        />
                        {name}
                        {role === user.role && <Icon name="Check" size={15} />}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  className="logout-item"
                  onClick={async () => {
                    try {
                      await logout();
                    } catch (e) {
                      toast(e.message, 'error');
                    }
                  }}
                >
                  <Icon name="LogOut" size={18} />
                  خروج از حساب
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="main-content" id="main-content">
        <Outlet key={`${user.role}-${user.id}`} />
        <footer className="main-footer">
          <span>مدرسه‌یار؛ همراه مدیریت، هم‌مسیر یادگیری</span>
          <span>
            ساخته‌شده برای روزهای بهتر مدرسه <Icon name="HeartHandshake" size={14} />
          </span>
        </footer>
      </main>
      {search && <GlobalSearch onClose={() => setSearch(false)} />}
      {help && <HelpDialog onClose={() => setHelp(false)} />}
    </div>
  );
}
