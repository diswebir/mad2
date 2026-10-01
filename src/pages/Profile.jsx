import React, { useState } from 'react';
import { roles } from '../../shared/catalog';
import { useApp } from '../context';
import { api } from '../lib/api';
import { Avatar, Badge, Button, Empty, ErrorBox, Icon, Modal, PageHeader } from '../components/ui';
import { PasswordForm } from '../components/PasswordForm';
export default function Profile() {
  const { user, session, setSession, can, toast } = useApp();
  const [values, setValues] = useState({
      full_name: user.full_name,
      email: user.email || '',
      phone: user.phone || '',
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await api('/auth/profile', { method: 'PATCH', body: values });
      setSession({ ...session, user: result.user });
      toast('اطلاعات حساب شما ذخیره شد.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="profile-page page-enter">
      <PageHeader
        title="حساب کاربری من"
        description="اطلاعات حساب و امنیت ورودتان را مدیریت کنید."
      />
      <div className="profile-settings-grid">
        <div>
          <section className="panel account-identity">
            <Avatar name={user.full_name} id={user.id} size="xl" />
            <h2>{user.full_name}</h2>
            <Badge tone="purple">{roles[user.role]}</Badge>
            <div>
              <span>نام کاربری</span>
              <strong dir="ltr">{user.username}</strong>
            </div>
            <div>
              <span>نقش حساب</span>
              <strong>{roles[user.role]}</strong>
            </div>
            <p>
              <Icon name="ShieldCheck" size={16} />
              نقش‌ها توسط مدیر مدرسه تعیین می‌شوند.
            </p>
          </section>
        </div>
        <div className="profile-settings-forms">
          {can('profile.edit') && (
            <section className="panel">
              <div className="panel-heading">
                <h2>اطلاعات شخصی حساب</h2>
                <Icon name="CircleUserRound" />
              </div>
              <form onSubmit={save}>
                <div className="panel-padding form-stack">
                  {error && <ErrorBox error={error} />}
                  <label>
                    نام و نام خانوادگی
                    <input
                      required
                      minLength={2}
                      maxLength={100}
                      value={values.full_name}
                      onChange={(e) => setValues((v) => ({ ...v, full_name: e.target.value }))}
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      ایمیل
                      <input
                        type="email"
                        dir="ltr"
                        value={values.email}
                        onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
                      />
                    </label>
                    <label>
                      شماره تماس
                      <input
                        type="tel"
                        dir="ltr"
                        maxLength={20}
                        value={values.phone}
                        onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
                      />
                    </label>
                  </div>
                  <p className="small-text muted">
                    این اطلاعات مربوط به حساب ورود است؛ اطلاعات رسمی پرونده را مدیر مدرسه ویرایش
                    می‌کند.
                  </p>
                </div>
                <div className="settings-form-footer">
                  <Button type="submit" icon="Check" loading={busy}>
                    ذخیره اطلاعات
                  </Button>
                </div>
              </form>
            </section>
          )}
          {can('profile.password') && (
            <section className="panel">
              <div className="panel-heading">
                <h2>امنیت و رمز عبور</h2>
                <Icon name="KeyRound" />
              </div>
              <PasswordForm />
            </section>
          )}
          {!can('profile.edit') && !can('profile.password') && (
            <div className="panel">
              <Empty
                title="ویرایش حساب غیرفعال است"
                description="برای تغییر اطلاعات با مدیر مدرسه تیکت باز کنید."
                icon="LockKeyhole"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
