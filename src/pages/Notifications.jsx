import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context';
import { api, dateFa, fa } from '../lib/api';
import { Badge, Button, Empty, Icon, PageHeader } from '../components/ui';
export default function Notifications() {
  const { notifications, can, markNotifications, refreshNotifications, toast } = useApp();
  const navigate = useNavigate();
  const mark = async () => {
    try {
      await markNotifications();
      toast('همه اعلان‌ها خوانده شدند.');
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  const open = async (item) => {
    try {
      if (!item.is_read) await markNotifications(item.id);
    } catch (e) {
      toast(e.message, 'error');
    }
    navigate(item.link || '/');
  };
  if (!can('notifications.view')) return <Empty title="اعلان‌ها غیرفعال شده‌اند" icon="Bell" />;
  return (
    <div className="page-enter">
      <PageHeader
        title="خبرهای شما"
        description="پیام‌های مهم مدرسه، حضور و تکالیف را اینجا دنبال کنید."
      >
        {can('notifications.read') && (
          <Button
            variant="secondary"
            icon="CheckCheck"
            disabled={!notifications.unread}
            onClick={mark}
          >
            خواندن همه اعلان‌ها
          </Button>
        )}
      </PageHeader>
      <section className="panel full-notifications">
        <div className="panel-heading">
          <h2>صندوق اعلان</h2>
          <Badge tone="purple">{fa(notifications.unread)} خوانده‌نشده</Badge>
        </div>
        {notifications.items.length ? (
          notifications.items.map((n) => (
            <button
              key={n.id}
              className={`full-notification-item ${!n.is_read ? 'unread' : ''}`}
              onClick={() => open(n)}
            >
              <span className="stat-icon tone-purple">
                <Icon
                  name={
                    n.type === 'ticket'
                      ? 'MessageCircle'
                      : n.type === 'attendance'
                        ? 'CalendarCheck2'
                        : n.type === 'education'
                          ? 'Award'
                          : 'Bell'
                  }
                  size={22}
                />
              </span>
              <div>
                <h3>
                  {n.title}
                  {!n.is_read && <i />}
                </h3>
                <p>{n.body}</p>
                <small>
                  {dateFa(n.created_at, {
                    day: 'numeric',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </small>
              </div>
              <Icon name="ChevronLeft" size={18} />
            </button>
          ))
        ) : (
          <Empty
            title="همه‌چیز آرام است"
            description="وقتی خبر جدیدی داشته باشید، اینجا ظاهر می‌شود."
            icon="Bell"
          />
        )}
        {notifications.page < notifications.pages && (
          <div className="panel-padding">
            <Button
              variant="secondary"
              icon="ChevronDown"
              loading={notifications.loading}
              onClick={() => refreshNotifications(notifications.page + 1)}
            >
              نمایش اعلان‌های قدیمی‌تر
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
