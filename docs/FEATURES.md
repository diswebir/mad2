# فهرست دقیق 134 قابلیت نسخهٔ اول

این فهرست از `shared/catalog.js` با `npm run features` ساخته می‌شود. همهٔ موارد زیر endpoint یا بخش UI واقعی دارند؛ برنامه‌ریزی آینده در این شمارش نیست.

**تعریف شمارش:** 25 نوع پرونده × چهار عملیات مستقل مشاهده/جست‌وجو/فیلتر/صفحه‌بندی، ثبت، ویرایش و حذف ایمن = ۱۰۰ قابلیت؛ به‌علاوهٔ ۳۴ workflow و کنترل مستقل. ۱۳۴ نام تجاری مجزا یا ۱۳۴ صفحه ادعا نشده است.

کلید ماژول و کلید قابلیت در UI و سرور اعمال می‌شوند. نقش و scope حتی پس از فعال‌بودن کلید لازم‌اند. قابلیت مدیریت کلیدها و ماژول پایهٔ تنظیمات برای جلوگیری از قفل مدیریت ضروری‌اند. «تغییر رمز اجباری» نیز با خاموش‌شدن تغییر رمز اختیاری از دسترس خارج نمی‌شود.

## داشبورد — ۴ قابلیت

نمای کلی مدرسه، آمار و فعالیت‌های روزانه

| ردیف | قابلیت                  | کلید ثابت              | دسترسی                   | وضعیت          |
| ---- | ----------------------- | ---------------------- | ------------------------ | -------------- |
| 1    | نمای کلی نقش‌محور مدرسه | `dashboard.view`       | همه نقش‌ها با scope مجاز | پیاده‌سازی‌شده |
| 2    | کارت‌های آماری زنده     | `dashboard.statistics` | همه نقش‌ها با scope مجاز | پیاده‌سازی‌شده |
| 3    | نمودار روند حضور        | `dashboard.chart`      | همه نقش‌ها با scope مجاز | پیاده‌سازی‌شده |
| 4    | فعالیت‌های اخیر مدرسه   | `dashboard.activities` | همه نقش‌ها با scope مجاز | پیاده‌سازی‌شده |

**محل استفاده:** `/`؛ برای پرونده‌های چندزبانه، tab مربوط به پرونده را انتخاب کنید.

- **dashboard.view**: `GET /api/dashboard`
- **dashboard.statistics**: `GET /api/dashboard → stats`
- **dashboard.chart**: `GET /api/dashboard?period=current|previous → chart`
- **dashboard.activities**: `GET /api/dashboard → activities`

## دانش‌آموزان — ۲۴ قابلیت

پرونده، اولیا، سلامت و سوابق دانش‌آموز

| ردیف | قابلیت                            | کلید ثابت           | دسترسی                                     | وضعیت          |
| ---- | --------------------------------- | ------------------- | ------------------------------------------ | -------------- |
| 5    | مشاهده و جست‌وجوی دانش‌آموزان     | `students.view`     | مدیر مدرسه، معلم، دانش‌آموز، ولی دانش‌آموز | پیاده‌سازی‌شده |
| 6    | ثبت دانش‌آموز                     | `students.create`   | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 7    | ویرایش دانش‌آموز                  | `students.edit`     | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 8    | حذف ایمن دانش‌آموز                | `students.delete`   | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 9    | مشاهده و جست‌وجوی مشاوره          | `counseling.view`   | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |
| 10   | ثبت جلسه مشاوره                   | `counseling.create` | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |
| 11   | ویرایش جلسه مشاوره                | `counseling.edit`   | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |
| 12   | حذف ایمن جلسه مشاوره              | `counseling.delete` | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |
| 13   | مشاهده و جست‌وجوی سوابق رفتاری    | `discipline.view`   | مدیر مدرسه، معلم، دانش‌آموز، ولی دانش‌آموز | پیاده‌سازی‌شده |
| 14   | ثبت سابقه رفتاری                  | `discipline.create` | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |
| 15   | ویرایش سابقه رفتاری               | `discipline.edit`   | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |
| 16   | حذف ایمن سابقه رفتاری             | `discipline.delete` | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |
| 17   | مشاهده و جست‌وجوی پرونده سلامت    | `health.view`       | مدیر مدرسه، دانش‌آموز، ولی دانش‌آموز       | پیاده‌سازی‌شده |
| 18   | ثبت معاینه                        | `health.create`     | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 19   | ویرایش معاینه                     | `health.edit`       | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 20   | حذف ایمن معاینه                   | `health.delete`     | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 21   | مشاهده و جست‌وجوی مدارک دانش‌آموز | `documents.view`    | مدیر مدرسه، معلم، دانش‌آموز، ولی دانش‌آموز | پیاده‌سازی‌شده |
| 22   | ثبت مدرک                          | `documents.create`  | مدیر مدرسه، دانش‌آموز، ولی دانش‌آموز       | پیاده‌سازی‌شده |
| 23   | ویرایش مدرک                       | `documents.edit`    | مدیر مدرسه، دانش‌آموز، ولی دانش‌آموز       | پیاده‌سازی‌شده |
| 24   | حذف ایمن مدرک                     | `documents.delete`  | مدیر مدرسه، دانش‌آموز، ولی دانش‌آموز       | پیاده‌سازی‌شده |
| 25   | پرونده یکپارچه دانش‌آموز و اولیا  | `students.profile`  | همه نقش‌ها با scope مجاز                   | پیاده‌سازی‌شده |
| 26   | خروجی CSV دانش‌آموزان             | `students.export`   | همه نقش‌ها با scope مجاز                   | پیاده‌سازی‌شده |
| 27   | ورود گروهی دانش‌آموز از CSV       | `students.import`   | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 28   | ساخت حساب کاربری دانش‌آموز        | `students.account`  | مدیر مدرسه                                 | پیاده‌سازی‌شده |

**محل استفاده:** `/students`؛ برای پرونده‌های چندزبانه، tab مربوط به پرونده را انتخاب کنید.

- **students.view**: `GET /api/entities/students`
- **students.create**: `POST /api/entities/students`
- **students.edit**: `PATCH /api/entities/students/:id`
- **students.delete**: `DELETE /api/entities/students/:id`
- **counseling.view**: `GET /api/entities/counseling`
- **counseling.create**: `POST /api/entities/counseling`
- **counseling.edit**: `PATCH /api/entities/counseling/:id`
- **counseling.delete**: `DELETE /api/entities/counseling/:id`
- **discipline.view**: `GET /api/entities/discipline`
- **discipline.create**: `POST /api/entities/discipline`
- **discipline.edit**: `PATCH /api/entities/discipline/:id`
- **discipline.delete**: `DELETE /api/entities/discipline/:id`
- **health.view**: `GET /api/entities/health`
- **health.create**: `POST /api/entities/health`
- **health.edit**: `PATCH /api/entities/health/:id`
- **health.delete**: `DELETE /api/entities/health/:id`
- **documents.view**: `GET /api/entities/documents`
- **documents.create**: `POST /api/entities/documents`
- **documents.edit**: `PATCH /api/entities/documents/:id`
- **documents.delete**: `DELETE /api/entities/documents/:id`
- **students.profile**: `GET /api/students/:id/profile`
- **students.export**: `GET /api/entities/students/export`
- **students.import**: `POST /api/entities/students/import (multipart CSV)`
- **students.account**: `POST /api/settings/accounts/create/students/:id + auto on create`

## معلمان و کارکنان — ۹ قابلیت

مدیریت همکاران، حساب کاربری و حقوق

| ردیف | قابلیت                         | کلید ثابت          | دسترسی           | وضعیت          |
| ---- | ------------------------------ | ------------------ | ---------------- | -------------- |
| 29   | مشاهده و جست‌وجوی معلمان       | `teachers.view`    | مدیر مدرسه، معلم | پیاده‌سازی‌شده |
| 30   | ثبت معلم                       | `teachers.create`  | مدیر مدرسه       | پیاده‌سازی‌شده |
| 31   | ویرایش معلم                    | `teachers.edit`    | مدیر مدرسه       | پیاده‌سازی‌شده |
| 32   | حذف ایمن معلم                  | `teachers.delete`  | مدیر مدرسه       | پیاده‌سازی‌شده |
| 33   | مشاهده و جست‌وجوی حقوق همکاران | `payroll.view`     | مدیر مدرسه، معلم | پیاده‌سازی‌شده |
| 34   | ثبت فیش حقوقی                  | `payroll.create`   | مدیر مدرسه       | پیاده‌سازی‌شده |
| 35   | ویرایش فیش حقوقی               | `payroll.edit`     | مدیر مدرسه       | پیاده‌سازی‌شده |
| 36   | حذف ایمن فیش حقوقی             | `payroll.delete`   | مدیر مدرسه       | پیاده‌سازی‌شده |
| 37   | ساخت حساب کاربری معلم          | `teachers.account` | مدیر مدرسه       | پیاده‌سازی‌شده |

**محل استفاده:** `/teachers`؛ برای پرونده‌های چندزبانه، tab مربوط به پرونده را انتخاب کنید.

- **teachers.view**: `GET /api/entities/teachers`
- **teachers.create**: `POST /api/entities/teachers`
- **teachers.edit**: `PATCH /api/entities/teachers/:id`
- **teachers.delete**: `DELETE /api/entities/teachers/:id`
- **payroll.view**: `GET /api/entities/payroll`
- **payroll.create**: `POST /api/entities/payroll`
- **payroll.edit**: `PATCH /api/entities/payroll/:id`
- **payroll.delete**: `DELETE /api/entities/payroll/:id`
- **teachers.account**: `POST /api/settings/accounts/create/teachers/:id + auto on create`

## کلاس‌ها و فضاها — ۹ قابلیت

کلاس‌بندی، معلم راهنما و مدیریت اتاق‌ها

| ردیف | قابلیت                          | کلید ثابت        | دسترسی                                     | وضعیت          |
| ---- | ------------------------------- | ---------------- | ------------------------------------------ | -------------- |
| 38   | مشاهده و جست‌وجوی کلاس‌ها       | `classes.view`   | مدیر مدرسه، معلم، دانش‌آموز، ولی دانش‌آموز | پیاده‌سازی‌شده |
| 39   | ثبت کلاس                        | `classes.create` | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 40   | ویرایش کلاس                     | `classes.edit`   | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 41   | حذف ایمن کلاس                   | `classes.delete` | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 42   | مشاهده و جست‌وجوی فضاهای آموزشی | `rooms.view`     | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |
| 43   | ثبت فضا                         | `rooms.create`   | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 44   | ویرایش فضا                      | `rooms.edit`     | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 45   | حذف ایمن فضا                    | `rooms.delete`   | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 46   | فهرست اعضای کلاس                | `classes.roster` | همه نقش‌ها با scope مجاز                   | پیاده‌سازی‌شده |

**محل استفاده:** `/classes`؛ برای پرونده‌های چندزبانه، tab مربوط به پرونده را انتخاب کنید.

- **classes.view**: `GET /api/entities/classes`
- **classes.create**: `POST /api/entities/classes`
- **classes.edit**: `PATCH /api/entities/classes/:id`
- **classes.delete**: `DELETE /api/entities/classes/:id`
- **rooms.view**: `GET /api/entities/rooms`
- **rooms.create**: `POST /api/entities/rooms`
- **rooms.edit**: `PATCH /api/entities/rooms/:id`
- **rooms.delete**: `DELETE /api/entities/rooms/:id`
- **classes.roster**: `GET /api/classes/:id/roster`

## حضور و غیاب — ۵ قابلیت

ثبت روزانه، تأخیر، غیبت و گزارش کلاس

| ردیف | قابلیت                       | کلید ثابت            | دسترسی                   | وضعیت          |
| ---- | ---------------------------- | -------------------- | ------------------------ | -------------- |
| 47   | فهرست روزانه حضور و غیاب     | `attendance.view`    | همه نقش‌ها با scope مجاز | پیاده‌سازی‌شده |
| 48   | ثبت حاضر، غایب، تأخیر و موجه | `attendance.record`  | مدیر مدرسه، معلم         | پیاده‌سازی‌شده |
| 49   | ثبت گروهی حضور کلاس          | `attendance.bulk`    | مدیر مدرسه، معلم         | پیاده‌سازی‌شده |
| 50   | خروجی حضور و غیاب            | `attendance.export`  | همه نقش‌ها با scope مجاز | پیاده‌سازی‌شده |
| 51   | تاریخچه حضور دانش‌آموز       | `attendance.history` | همه نقش‌ها با scope مجاز | پیاده‌سازی‌شده |

**محل استفاده:** `/attendance`؛ برای پرونده‌های چندزبانه، tab مربوط به پرونده را انتخاب کنید.

- **attendance.view**: `GET /api/attendance?class_id=&date=`
- **attendance.record**: `POST /api/attendance`
- **attendance.bulk**: `POST /api/attendance (records > 1)`
- **attendance.export**: `GET /api/attendance/export`
- **attendance.history**: `GET /api/attendance/student/:id`

## آموزش و نمرات — ۲۲ قابلیت

دروس، برنامه هفتگی، تکالیف و ارزشیابی

| ردیف | قابلیت                            | کلید ثابت            | دسترسی                                     | وضعیت          |
| ---- | --------------------------------- | -------------------- | ------------------------------------------ | -------------- |
| 52   | مشاهده و جست‌وجوی دروس            | `subjects.view`      | مدیر مدرسه، معلم، دانش‌آموز، ولی دانش‌آموز | پیاده‌سازی‌شده |
| 53   | ثبت درس                           | `subjects.create`    | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 54   | ویرایش درس                        | `subjects.edit`      | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 55   | حذف ایمن درس                      | `subjects.delete`    | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 56   | مشاهده و جست‌وجوی برنامه هفتگی    | `schedules.view`     | مدیر مدرسه، معلم، دانش‌آموز، ولی دانش‌آموز | پیاده‌سازی‌شده |
| 57   | ثبت زنگ درسی                      | `schedules.create`   | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 58   | ویرایش زنگ درسی                   | `schedules.edit`     | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 59   | حذف ایمن زنگ درسی                 | `schedules.delete`   | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 60   | مشاهده و جست‌وجوی تکالیف          | `assignments.view`   | مدیر مدرسه، معلم، دانش‌آموز، ولی دانش‌آموز | پیاده‌سازی‌شده |
| 61   | ثبت تکلیف                         | `assignments.create` | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |
| 62   | ویرایش تکلیف                      | `assignments.edit`   | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |
| 63   | حذف ایمن تکلیف                    | `assignments.delete` | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |
| 64   | مشاهده و جست‌وجوی آزمون‌ها        | `exams.view`         | مدیر مدرسه، معلم، دانش‌آموز، ولی دانش‌آموز | پیاده‌سازی‌شده |
| 65   | ثبت آزمون                         | `exams.create`       | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |
| 66   | ویرایش آزمون                      | `exams.edit`         | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |
| 67   | حذف ایمن آزمون                    | `exams.delete`       | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |
| 68   | مشاهده و جست‌وجوی نمرات و کارنامه | `grades.view`        | مدیر مدرسه، معلم، دانش‌آموز، ولی دانش‌آموز | پیاده‌سازی‌شده |
| 69   | ثبت نمره                          | `grades.create`      | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |
| 70   | ویرایش نمره                       | `grades.edit`        | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |
| 71   | حذف ایمن نمره                     | `grades.delete`      | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |
| 72   | تحویل تکلیف توسط دانش‌آموز        | `assignments.submit` | دانش‌آموز                                  | پیاده‌سازی‌شده |
| 73   | ارزیابی و بازخورد تکالیف          | `assignments.review` | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |

**محل استفاده:** `/education`؛ برای پرونده‌های چندزبانه، tab مربوط به پرونده را انتخاب کنید.

- **subjects.view**: `GET /api/entities/subjects`
- **subjects.create**: `POST /api/entities/subjects`
- **subjects.edit**: `PATCH /api/entities/subjects/:id`
- **subjects.delete**: `DELETE /api/entities/subjects/:id`
- **schedules.view**: `GET /api/entities/schedules`
- **schedules.create**: `POST /api/entities/schedules`
- **schedules.edit**: `PATCH /api/entities/schedules/:id`
- **schedules.delete**: `DELETE /api/entities/schedules/:id`
- **assignments.view**: `GET /api/entities/assignments`
- **assignments.create**: `POST /api/entities/assignments`
- **assignments.edit**: `PATCH /api/entities/assignments/:id`
- **assignments.delete**: `DELETE /api/entities/assignments/:id`
- **exams.view**: `GET /api/entities/exams`
- **exams.create**: `POST /api/entities/exams`
- **exams.edit**: `PATCH /api/entities/exams/:id`
- **exams.delete**: `DELETE /api/entities/exams/:id`
- **grades.view**: `GET /api/entities/grades`
- **grades.create**: `POST /api/entities/grades`
- **grades.edit**: `PATCH /api/entities/grades/:id`
- **grades.delete**: `DELETE /api/entities/grades/:id`
- **assignments.submit**: `POST /api/assignments/:id/submit`
- **assignments.review**: `GET /api/assignments/:id/submissions + PATCH /api/assignments/:id/submissions/:submissionId`

## پیام‌ها و تیکت‌ها — ۵ قابلیت

ارتباط امن با مدیر و معلمان و پیوست فایل

| ردیف | قابلیت                       | کلید ثابت             | دسترسی                   | وضعیت          |
| ---- | ---------------------------- | --------------------- | ------------------------ | -------------- |
| 74   | صندوق تیکت با دسترسی اختصاصی | `tickets.view`        | همه نقش‌ها با scope مجاز | پیاده‌سازی‌شده |
| 75   | ارسال تیکت به مدیر یا معلم   | `tickets.create`      | همه نقش‌ها با scope مجاز | پیاده‌سازی‌شده |
| 76   | پاسخ در گفت‌وگوی تیکت        | `tickets.reply`       | همه نقش‌ها با scope مجاز | پیاده‌سازی‌شده |
| 77   | تغییر وضعیت و اولویت تیکت    | `tickets.manage`      | گیرندهٔ تیکت یا مدیر     | پیاده‌سازی‌شده |
| 78   | پیوست امن فایل در تیکت       | `tickets.attachments` | همه نقش‌ها با scope مجاز | پیاده‌سازی‌شده |

**محل استفاده:** `/tickets`؛ برای پرونده‌های چندزبانه، tab مربوط به پرونده را انتخاب کنید.

- **tickets.view**: `GET /api/tickets + GET /api/tickets/:id`
- **tickets.create**: `POST /api/tickets`
- **tickets.reply**: `POST /api/tickets/:id/messages`
- **tickets.manage**: `PATCH /api/tickets/:id`
- **tickets.attachments**: `POST /api/files?context=tickets + authorized GET /api/files/:id`

## اطلاعیه‌ها — ۴ قابلیت

اطلاع‌رسانی هدفمند به اعضای مدرسه

| ردیف | قابلیت                       | کلید ثابت              | دسترسی                                     | وضعیت          |
| ---- | ---------------------------- | ---------------------- | ------------------------------------------ | -------------- |
| 79   | مشاهده و جست‌وجوی اطلاعیه‌ها | `announcements.view`   | مدیر مدرسه، معلم، دانش‌آموز، ولی دانش‌آموز | پیاده‌سازی‌شده |
| 80   | ثبت اطلاعیه                  | `announcements.create` | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |
| 81   | ویرایش اطلاعیه               | `announcements.edit`   | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |
| 82   | حذف ایمن اطلاعیه             | `announcements.delete` | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |

**محل استفاده:** `/announcements`؛ برای پرونده‌های چندزبانه، tab مربوط به پرونده را انتخاب کنید.

- **announcements.view**: `GET /api/entities/announcements`
- **announcements.create**: `POST /api/entities/announcements`
- **announcements.edit**: `PATCH /api/entities/announcements/:id`
- **announcements.delete**: `DELETE /api/entities/announcements/:id`

## تقویم و رویدادها — ۴ قابلیت

جلسات، اردوها، مناسبت‌ها و برنامه‌ها

| ردیف | قابلیت                     | کلید ثابت       | دسترسی                                     | وضعیت          |
| ---- | -------------------------- | --------------- | ------------------------------------------ | -------------- |
| 83   | مشاهده و جست‌وجوی رویدادها | `events.view`   | مدیر مدرسه، معلم، دانش‌آموز، ولی دانش‌آموز | پیاده‌سازی‌شده |
| 84   | ثبت رویداد                 | `events.create` | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |
| 85   | ویرایش رویداد              | `events.edit`   | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |
| 86   | حذف ایمن رویداد            | `events.delete` | مدیر مدرسه، معلم                           | پیاده‌سازی‌شده |

**محل استفاده:** `/calendar`؛ برای پرونده‌های چندزبانه، tab مربوط به پرونده را انتخاب کنید.

- **events.view**: `GET /api/entities/events`
- **events.create**: `POST /api/entities/events`
- **events.edit**: `PATCH /api/entities/events/:id`
- **events.delete**: `DELETE /api/entities/events/:id`

## امور مالی — ۱۲ قابلیت

شهریه، رسید پرداخت و هزینه‌های مدرسه

| ردیف | قابلیت                             | کلید ثابت         | دسترسی                               | وضعیت          |
| ---- | ---------------------------------- | ----------------- | ------------------------------------ | -------------- |
| 87   | مشاهده و جست‌وجوی شهریه و صورتحساب | `invoices.view`   | مدیر مدرسه، دانش‌آموز، ولی دانش‌آموز | پیاده‌سازی‌شده |
| 88   | ثبت صورتحساب                       | `invoices.create` | مدیر مدرسه                           | پیاده‌سازی‌شده |
| 89   | ویرایش صورتحساب                    | `invoices.edit`   | مدیر مدرسه                           | پیاده‌سازی‌شده |
| 90   | حذف ایمن صورتحساب                  | `invoices.delete` | مدیر مدرسه                           | پیاده‌سازی‌شده |
| 91   | مشاهده و جست‌وجوی پرداخت‌ها        | `payments.view`   | مدیر مدرسه، دانش‌آموز، ولی دانش‌آموز | پیاده‌سازی‌شده |
| 92   | ثبت پرداخت                         | `payments.create` | مدیر مدرسه                           | پیاده‌سازی‌شده |
| 93   | ویرایش پرداخت                      | `payments.edit`   | مدیر مدرسه                           | پیاده‌سازی‌شده |
| 94   | حذف ایمن پرداخت                    | `payments.delete` | مدیر مدرسه                           | پیاده‌سازی‌شده |
| 95   | مشاهده و جست‌وجوی هزینه‌های مدرسه  | `expenses.view`   | مدیر مدرسه                           | پیاده‌سازی‌شده |
| 96   | ثبت هزینه                          | `expenses.create` | مدیر مدرسه                           | پیاده‌سازی‌شده |
| 97   | ویرایش هزینه                       | `expenses.edit`   | مدیر مدرسه                           | پیاده‌سازی‌شده |
| 98   | حذف ایمن هزینه                     | `expenses.delete` | مدیر مدرسه                           | پیاده‌سازی‌شده |

**محل استفاده:** `/finance`؛ برای پرونده‌های چندزبانه، tab مربوط به پرونده را انتخاب کنید.

- **invoices.view**: `GET /api/entities/invoices`
- **invoices.create**: `POST /api/entities/invoices`
- **invoices.edit**: `PATCH /api/entities/invoices/:id`
- **invoices.delete**: `DELETE /api/entities/invoices/:id`
- **payments.view**: `GET /api/entities/payments`
- **payments.create**: `POST /api/entities/payments`
- **payments.edit**: `PATCH /api/entities/payments/:id`
- **payments.delete**: `DELETE /api/entities/payments/:id`
- **expenses.view**: `GET /api/entities/expenses`
- **expenses.create**: `POST /api/entities/expenses`
- **expenses.edit**: `PATCH /api/entities/expenses/:id`
- **expenses.delete**: `DELETE /api/entities/expenses/:id`

## کتابخانه — ۸ قابلیت

کتاب‌ها، موجودی و گردش امانت

| ردیف | قابلیت                              | کلید ثابت      | دسترسی                                     | وضعیت          |
| ---- | ----------------------------------- | -------------- | ------------------------------------------ | -------------- |
| 99   | مشاهده و جست‌وجوی کتاب‌های کتابخانه | `books.view`   | مدیر مدرسه، معلم، دانش‌آموز، ولی دانش‌آموز | پیاده‌سازی‌شده |
| 100  | ثبت کتاب                            | `books.create` | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 101  | ویرایش کتاب                         | `books.edit`   | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 102  | حذف ایمن کتاب                       | `books.delete` | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 103  | مشاهده و جست‌وجوی امانت کتاب        | `loans.view`   | مدیر مدرسه، معلم، دانش‌آموز، ولی دانش‌آموز | پیاده‌سازی‌شده |
| 104  | ثبت امانت                           | `loans.create` | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 105  | ویرایش امانت                        | `loans.edit`   | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 106  | حذف ایمن امانت                      | `loans.delete` | مدیر مدرسه                                 | پیاده‌سازی‌شده |

**محل استفاده:** `/library`؛ برای پرونده‌های چندزبانه، tab مربوط به پرونده را انتخاب کنید.

- **books.view**: `GET /api/entities/books`
- **books.create**: `POST /api/entities/books`
- **books.edit**: `PATCH /api/entities/books/:id`
- **books.delete**: `DELETE /api/entities/books/:id`
- **loans.view**: `GET /api/entities/loans`
- **loans.create**: `POST /api/entities/loans`
- **loans.edit**: `PATCH /api/entities/loans/:id`
- **loans.delete**: `DELETE /api/entities/loans/:id`

## خدمات مدرسه — ۱۲ قابلیت

سرویس، تجهیزات و ثبت ورود مهمانان

| ردیف | قابلیت                              | کلید ثابت          | دسترسی                                     | وضعیت          |
| ---- | ----------------------------------- | ------------------ | ------------------------------------------ | -------------- |
| 107  | مشاهده و جست‌وجوی تجهیزات و اموال   | `inventory.view`   | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 108  | ثبت تجهیز                           | `inventory.create` | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 109  | ویرایش تجهیز                        | `inventory.edit`   | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 110  | حذف ایمن تجهیز                      | `inventory.delete` | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 111  | مشاهده و جست‌وجوی سرویس مدرسه       | `routes.view`      | مدیر مدرسه، معلم، دانش‌آموز، ولی دانش‌آموز | پیاده‌سازی‌شده |
| 112  | ثبت سرویس                           | `routes.create`    | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 113  | ویرایش سرویس                        | `routes.edit`      | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 114  | حذف ایمن سرویس                      | `routes.delete`    | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 115  | مشاهده و جست‌وجوی دفتر ورود مهمانان | `visitors.view`    | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 116  | ثبت مراجعه                          | `visitors.create`  | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 117  | ویرایش مراجعه                       | `visitors.edit`    | مدیر مدرسه                                 | پیاده‌سازی‌شده |
| 118  | حذف ایمن مراجعه                     | `visitors.delete`  | مدیر مدرسه                                 | پیاده‌سازی‌شده |

**محل استفاده:** `/services`؛ برای پرونده‌های چندزبانه، tab مربوط به پرونده را انتخاب کنید.

- **inventory.view**: `GET /api/entities/inventory`
- **inventory.create**: `POST /api/entities/inventory`
- **inventory.edit**: `PATCH /api/entities/inventory/:id`
- **inventory.delete**: `DELETE /api/entities/inventory/:id`
- **routes.view**: `GET /api/entities/routes`
- **routes.create**: `POST /api/entities/routes`
- **routes.edit**: `PATCH /api/entities/routes/:id`
- **routes.delete**: `DELETE /api/entities/routes/:id`
- **visitors.view**: `GET /api/entities/visitors`
- **visitors.create**: `POST /api/entities/visitors`
- **visitors.edit**: `PATCH /api/entities/visitors/:id`
- **visitors.delete**: `DELETE /api/entities/visitors/:id`

## گزارش‌ها — ۲ قابلیت

تحلیل آموزشی، حضور و مالی با خروجی CSV

| ردیف | قابلیت                            | کلید ثابت        | دسترسی                   | وضعیت          |
| ---- | --------------------------------- | ---------------- | ------------------------ | -------------- |
| 119  | گزارش‌های تجمیعی و معدل وزنی      | `reports.view`   | همه نقش‌ها با scope مجاز | پیاده‌سازی‌شده |
| 120  | دانلود گزارش قابل استفاده در اکسل | `reports.export` | همه نقش‌ها با scope مجاز | پیاده‌سازی‌شده |

**محل استفاده:** `/reports`؛ برای پرونده‌های چندزبانه، tab مربوط به پرونده را انتخاب کنید.

- **reports.view**: `GET /api/reports`
- **reports.export**: `GET /api/reports/export`

## اعلان‌ها — ۲ قابلیت

صندوق اعلان و وضعیت خوانده‌شدن

| ردیف | قابلیت                        | کلید ثابت            | دسترسی                   | وضعیت          |
| ---- | ----------------------------- | -------------------- | ------------------------ | -------------- |
| 121  | اعلان‌های شخصی                | `notifications.view` | همه نقش‌ها با scope مجاز | پیاده‌سازی‌شده |
| 122  | ثبت اعلان به عنوان خوانده‌شده | `notifications.read` | همه نقش‌ها با scope مجاز | پیاده‌سازی‌شده |

**محل استفاده:** `/notifications`؛ برای پرونده‌های چندزبانه، tab مربوط به پرونده را انتخاب کنید.

- **notifications.view**: `GET /api/notifications`
- **notifications.read**: `PATCH /api/notifications/read`

## حساب کاربری — ۲ قابلیت

ویرایش مشخصات و تغییر امن رمز عبور

| ردیف | قابلیت                           | کلید ثابت          | دسترسی                   | وضعیت          |
| ---- | -------------------------------- | ------------------ | ------------------------ | -------------- |
| 123  | ویرایش نام و تماس حساب           | `profile.edit`     | همه نقش‌ها با scope مجاز | پیاده‌سازی‌شده |
| 124  | تغییر رمز عبور با بررسی رمز فعلی | `profile.password` | همه نقش‌ها با scope مجاز | پیاده‌سازی‌شده |

**محل استفاده:** `/profile`؛ برای پرونده‌های چندزبانه، tab مربوط به پرونده را انتخاب کنید.

- **profile.edit**: `PATCH /api/auth/profile`
- **profile.password**: `POST /api/auth/password`

## تنظیمات سامانه — ۱۰ قابلیت

مدرسه، سال تحصیلی، کاربران و پشتیبان

| ردیف | قابلیت                           | کلید ثابت                 | دسترسی     | وضعیت          |
| ---- | -------------------------------- | ------------------------- | ---------- | -------------- |
| 125  | مشاهده و جست‌وجوی سال‌های تحصیلی | `terms.view`              | مدیر مدرسه | پیاده‌سازی‌شده |
| 126  | ثبت سال تحصیلی                   | `terms.create`            | مدیر مدرسه | پیاده‌سازی‌شده |
| 127  | ویرایش سال تحصیلی                | `terms.edit`              | مدیر مدرسه | پیاده‌سازی‌شده |
| 128  | حذف ایمن سال تحصیلی              | `terms.delete`            | مدیر مدرسه | پیاده‌سازی‌شده |
| 129  | مشخصات و اطلاعات تماس مدرسه      | `settings.school`         | مدیر مدرسه | پیاده‌سازی‌شده |
| 130  | فعال‌سازی ماژول و قابلیت         | `settings.modules`        | مدیر مدرسه | هستهٔ ضروری    |
| 131  | مدیریت وضعیت حساب‌های کاربری     | `settings.accounts`       | مدیر مدرسه | پیاده‌سازی‌شده |
| 132  | بازنشانی امن رمز کاربران         | `settings.reset_password` | مدیر مدرسه | پیاده‌سازی‌شده |
| 133  | پشتیبان قابل دانلود SQLite       | `settings.backup`         | مدیر مدرسه | پیاده‌سازی‌شده |
| 134  | گزارش رویدادهای مدیریتی          | `settings.audit`          | مدیر مدرسه | پیاده‌سازی‌شده |

**محل استفاده:** `/settings`؛ برای پرونده‌های چندزبانه، tab مربوط به پرونده را انتخاب کنید.

- **terms.view**: `GET /api/entities/terms`
- **terms.create**: `POST /api/entities/terms`
- **terms.edit**: `PATCH /api/entities/terms/:id`
- **terms.delete**: `DELETE /api/entities/terms/:id`
- **settings.school**: `PATCH /api/settings/school`
- **settings.modules**: `PATCH /api/settings/modules/:id + PATCH /api/settings/features/:id`
- **settings.accounts**: `GET/POST /api/settings/accounts + PATCH /api/settings/accounts/:id`
- **settings.reset_password**: `POST /api/settings/accounts/:id/reset-password`
- **settings.backup**: `GET /api/settings/backup`
- **settings.audit**: `GET /api/settings/audit`

## ابزارهای تکمیلی خارج از شمارش

ویزارد نصب توکن‌دار، جست‌وجوی سراسری مجاز، فونت محلی وزیرمتن، رابط RTL، ورود و نشست امن، نمایش کارت/جدول، انتخاب‌گرهای رابطه، CSV عمومی پرونده‌های مجاز و بستهٔ cPanel وجود دارند ولی دوباره در عدد ۱۳۴ شمرده نشده‌اند.

## موارد خارج از نسخهٔ اول

درگاه پرداخت آنلاین، SMS/ایمیل خودکار، اتصال سناد/شاد، MFA، آزمون آنلاین سؤالی، کارنامهٔ رسمی مصوب، چندمدرسه‌ای، پنل چندفرزندی ولی و ذخیرهٔ چند worker پیاده نشده‌اند. CSV فایل اکسل XLSX نیست؛ در Excel قابل بازشدن است. پشتیبان SQLite شامل uploads نیست.

## آزمون

`tests/api.test.js` همهٔ ۱۰۰ عملیات عمومی را روی ۲۵ نوع پرونده اجرا می‌کند و مجوز، خاموش‌شدن ماژول/قابلیت، تراکنش، حضور، تیکت، فایل، تکلیف، پرداخت، ورود اجباری رمز، نصب یک‌باره و دوام/قفل بانک را نیز بررسی می‌کند. تست مرورگر در `tests/ui.spec.js` است.
