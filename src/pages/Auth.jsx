import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context';
import { Button, ErrorBox, Icon, IconButton, Modal, SchoolIllustration } from '../components/ui';
export default function Auth() {
  const { session, login, switchRole } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [help, setHelp] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      navigate('/');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const demo = async (role) => {
    setBusy(true);
    setError(null);
    try {
      await switchRole(role);
      navigate('/');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-page">
      <section className="auth-form-side">
        <Link className="brand auth-brand" to="/">
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
        <div className="auth-form-container">
          <div className="auth-welcome-icon">
            <Icon name="School" size={27} />
          </div>
          <h1>خوش آمدید!</h1>
          <p>برای ورود به {session?.school?.name || 'پنل مدرسه'}، اطلاعات حساب خود را وارد کنید.</p>
          {error && <ErrorBox error={error} />}
          <form onSubmit={submit} className="form-stack">
            <label htmlFor="login-username">
              نام کاربری
              <input
                id="login-username"
                required
                autoComplete="username"
                dir="ltr"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="نام کاربری شما"
                maxLength={100}
              />
            </label>
            <label htmlFor="login-password">
              رمز عبور
              <div className="password-input">
                <input
                  id="login-password"
                  required
                  autoComplete="current-password"
                  dir="ltr"
                  type={visible ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="رمز عبور"
                  maxLength={128}
                />
                <IconButton
                  name="Eye"
                  label={visible ? 'پنهان کردن رمز' : 'نمایش رمز'}
                  onClick={() => setVisible(!visible)}
                />
              </div>
            </label>
            <div className="login-options">
              <span>
                <Icon name="ShieldCheck" size={15} />
                ورود امن به سامانه
              </span>
              <button type="button" onClick={() => setHelp(true)}>
                رمز را فراموش کرده‌اید؟
              </button>
            </div>
            <Button type="submit" loading={busy} className="login-submit">
              ورود به حساب
              <Icon name="ArrowLeft" size={18} />
            </Button>
          </form>
          {session?.demo && (
            <div className="demo-login">
              <div className="divider-label">
                <span>یک نگاه به پنل‌های نمایشی</span>
              </div>
              <div>
                {[
                  ['admin', 'مدیر', 'ShieldCheck'],
                  ['teacher', 'معلم', 'UsersRound'],
                  ['student', 'دانش‌آموز', 'GraduationCap'],
                  ['parent', 'ولی', 'HeartHandshake'],
                ].map(([role, label, icon]) => (
                  <button type="button" key={role} disabled={busy} onClick={() => demo(role)}>
                    <Icon name={icon} size={20} />
                    {label}
                  </button>
                ))}
              </div>
              <p>
                داده‌های نمونه · رمز همه حساب‌های دمو: <span dir="ltr">School@1405</span>
              </p>
            </div>
          )}
          <p className="auth-support">
            نیاز به راهنمایی دارید؟{' '}
            <button onClick={() => setHelp(true)}>ارتباط با مدیر مدرسه</button>
          </p>
        </div>
        <footer className="auth-footer">
          <span>مدرسه‌یار · نسخه ۱.۰.۰</span>
          <Link to="/install">
            راهنمای راه‌اندازی
            <Icon name="ArrowUpLeft" size={14} />
          </Link>
        </footer>
      </section>
      <section className="auth-visual">
        <span className="auth-visual-tag">
          <Icon name="Sparkles" size={16} />
          مدرسه‌ای هوشمند، تجربه‌ای بهتر
        </span>
        <h2>
          مدرسه‌ای منظم‌تر،
          <br />
          روزهایی <em>روشن‌تر.</em>
        </h2>
        <p>
          از اولین حضور تا آخرین زنگ،
          <br />
          همراه مدرسه، معلم و دانش‌آموز.
        </p>
        <SchoolIllustration className="auth-school-illustration" />
        <div className="auth-feature-tags">
          <span>
            <Icon name="CalendarCheck2" size={18} />
            حضور و غیاب
          </span>
          <span>
            <Icon name="MessagesSquare" size={18} />
            ارتباط امن
          </span>
          <span>
            <Icon name="Award" size={18} />
            یادگیری بهتر
          </span>
        </div>
        <span className="auth-visual-bottom">۱۳۴ قابلیت · ۱۶ ماژول · یک فضای یکپارچه</span>
      </section>
      {help && (
        <Modal title="کمک برای ورود به حساب" onClose={() => setHelp(false)}>
          <div className="modal-body help-content">
            <section>
              <h3>نام کاربری را از مدرسه دریافت کنید</h3>
              <p>
                حساب معلم و دانش‌آموز توسط مدیر مدرسه ساخته می‌شود. در اولین ورود باید رمز موقت را
                تغییر دهید.
              </p>
            </section>
            <section>
              <h3>بازنشانی رمز عبور</h3>
              <p>
                برای حفظ امنیت، بازنشانی رمز در این نسخه توسط مدیر انجام می‌شود. از مدیر بخواهید در
                «تنظیمات ← حساب‌های کاربری» یک رمز موقت جدید برایتان بسازد.
              </p>
            </section>
            {session?.demo && (
              <section>
                <h3>حساب‌های نمایشی</h3>
                <p>
                  نام کاربری‌ها admin، teacher، student و parent هستند. رمز همه School@1405 است.
                  حساب‌های دمو فقط در اجرای توسعه قابل ورود مستقیم‌اند.
                </p>
              </section>
            )}
          </div>
          <footer className="modal-footer">
            <Button onClick={() => setHelp(false)}>متوجه شدم</Button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
