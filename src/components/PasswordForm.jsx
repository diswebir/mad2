import React, { useState } from 'react';
import { useApp } from '../context';
import { api } from '../lib/api';
import { Button, ErrorBox, Icon, Modal } from './ui';
export function PasswordForm({ forced = false, onDone }) {
  const { session, acceptSession, toast } = useApp();
  const [values, setValues] = useState({ current_password: '', new_password: '', confirm: '' }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [visible, setVisible] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setError(null);
    if (values.new_password !== values.confirm) {
      setError('رمز جدید و تکرار آن یکسان نیستند.');
      return;
    }
    setBusy(true);
    try {
      const response = await api('/auth/password', {
        method: 'POST',
        body: { current_password: values.current_password, new_password: values.new_password },
      });
      await acceptSession(response, session);
      setValues({ current_password: '', new_password: '', confirm: '' });
      toast('رمز عبور تغییر کرد و نشست‌های قبلی لغو شدند.');
      onDone?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save}>
      <div className={forced ? 'modal-body form-stack' : 'panel-padding form-stack'}>
        {error && <ErrorBox error={error} />}
        <div className="info-box">
          <Icon name="ShieldCheck" size={20} />
          <span>
            {forced
              ? 'برای امنیت حساب، رمز موقت را قبل از ورود به پنل تغییر دهید.'
              : 'رمز باید حداقل ۱۰ کاراکتر باشد. پس از تغییر، نشست‌های قبلی لغو می‌شوند.'}
          </span>
        </div>
        {[
          ['current_password', forced ? 'رمز موقت فعلی' : 'رمز عبور فعلی'],
          ['new_password', 'رمز عبور جدید'],
          ['confirm', 'تکرار رمز جدید'],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              required
              dir="ltr"
              type={visible ? 'text' : 'password'}
              autoComplete={key === 'current_password' ? 'current-password' : 'new-password'}
              minLength={key === 'current_password' ? 1 : 10}
              maxLength={128}
              value={values[key]}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
            />
          </label>
        ))}
        <label className="checkbox-label">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
          نمایش رمزها
        </label>
      </div>
      <div className={forced ? 'modal-footer' : 'settings-form-footer'}>
        <Button type="submit" loading={busy} icon="KeyRound">
          {forced ? 'تغییر رمز و ورود به پنل' : 'تغییر رمز عبور'}
        </Button>
      </div>
    </form>
  );
}
export function ForcedPassword() {
  return (
    <Modal
      title="یک قدم تا ورود امن"
      subtitle="حساب شما با یک رمز موقت ساخته شده است."
      onClose={() => {}}
      dismissible={false}
    >
      <PasswordForm forced />
    </Modal>
  );
}
