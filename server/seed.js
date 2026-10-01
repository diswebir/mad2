import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { schoolDate, addDateDays } from '../shared/dates.js';
const iso = (offset) => addDateDays(schoolDate(), offset);
const timestamp = (offset) => `${iso(offset)} 09:00:00`;
export const demoAccounts = {
  admin: 'admin',
  teacher: 'teacher',
  student: 'student',
  parent: 'parent',
};
export const DEMO_PASSWORD = 'School@1405';

export function seedDemo(db, { school, adminId } = {}) {
  const password = bcrypt.hashSync(DEMO_PASSWORD, 10);
  return db.transaction(() => {
    if (!adminId)
      adminId = db.insert('users', {
        username: 'admin',
        password_hash: password,
        full_name: 'علی احمدی',
        role: 'admin',
        email: 'admin@madresehyar.ir',
        phone: '09121234567',
      });
    const admin = db.get('SELECT * FROM users WHERE id=?', [adminId]);
    const sampleUsername = (base) => {
      let value = base,
        suffix = 1;
      while (db.get('SELECT id FROM users WHERE username=?', [value]))
        value = `${base}_${++suffix}`;
      return value;
    };
    db.setSetting(
      'school',
      school || {
        name: 'دبیرستان اندیشه',
        principal: admin.full_name,
        phone: '02188001234',
        email: 'info@andisheh.example',
        address: 'تهران، خیابان شریعتی، کوچه اندیشه، پلاک ۱۲',
        city: 'تهران',
        academic_year: '۱۴۰۵–۱۴۰۶',
      },
    );
    const teachers = [
      ['سارا', 'محمدی', 'ریاضی', 'female'],
      ['محمد', 'رضایی', 'علوم تجربی', 'male'],
      ['نرگس', 'کریمی', 'ادبیات فارسی', 'female'],
      ['امیر', 'جعفری', 'زبان انگلیسی', 'male'],
      ['مریم', 'صادقی', 'مطالعات اجتماعی', 'female'],
      ['رضا', 'مرادی', 'فرهنگ و هنر', 'male'],
      ['فاطمه', 'حسینی', 'پیام‌های آسمان', 'female'],
      ['حامد', 'اکبری', 'تربیت بدنی', 'male'],
      ['زهرا', 'موسوی', 'کار و فناوری', 'female'],
      ['علی', 'رحیمی', 'ریاضی', 'male'],
      ['سحر', 'نعمتی', 'علوم تجربی', 'female'],
      ['مهدی', 'شریفی', 'ادبیات فارسی', 'male'],
      ['الهام', 'عباسی', 'زبان انگلیسی', 'female'],
      ['حسین', 'نجفی', 'علوم تجربی', 'male'],
      ['نگین', 'کاظمی', 'مشاوره', 'female'],
      ['سعید', 'یوسفی', 'ریاضی', 'male'],
      ['پریسا', 'بهرامی', 'فرهنگ و هنر', 'female'],
      ['فرهاد', 'امینی', 'تربیت بدنی', 'male'],
    ];
    teachers.forEach(([first_name, last_name, specialty], i) => {
      const uid = db.insert('users', {
        username: sampleUsername(i === 0 ? 'teacher' : `teacher${i + 1}`),
        password_hash: password,
        full_name: `${first_name} ${last_name}`,
        role: 'teacher',
        phone: `0912${String(2000000 + i)}`,
      });
      const id = db.insert('teachers', {
        first_name,
        last_name,
        national_id: String(3000000000 + i),
        specialty,
        phone: `0912${2000000 + i}`,
        email: `teacher${i + 1}@example.com`,
        qualification: i % 3 === 0 ? 'کارشناسی ارشد' : 'کارشناسی',
        hire_date: '2023-09-23',
        employment: i % 4 === 0 ? 'part_time' : 'full_time',
        status: 'active',
        user_id: uid,
        author_id: adminId,
        bio: 'همراه دانش‌آموزان در مسیر یادگیری و رشد',
      });
      db.run('UPDATE users SET teacher_id=? WHERE id=?', [id, uid]);
    });
    for (let i = 0; i < 12; i++) {
      const grade = String(7 + Math.floor(i / 4));
      const gradeName = ['هفتم', 'هشتم', 'نهم'][Math.floor(i / 4)];
      db.insert('classes', {
        name: `${gradeName} ${['۱', '۲', '۳', '۴'][i % 4]}`,
        grade,
        teacher_id: i + 1,
        capacity: 30,
        room: `${101 + i}`,
        shift: 'morning',
        description: 'کلاس آموزشی با برنامه هفتگی منظم',
        author_id: adminId,
      });
    }
    ['شریعتی – قلهک', 'پاسداران – هروی', 'سهروردی – عباس‌آباد'].forEach((name, i) =>
      db.insert('routes', {
        name,
        driver_name: ['حسین مرادی', 'رضا شریفی', 'محمود اکبری'][i],
        phone: `0912333000${i}`,
        plate: `ایران ۱۱ · ${['۴۵۶', '۷۸۹', '۲۳۱'][i]} ب ۲۲`,
        capacity: 50,
        fee: 1200000,
        stops: 'ایستگاه اول: میدان اصلی\nایستگاه دوم: خیابان مرکزی',
        author_id: adminId,
      }),
    );
    const firstNames = [
      'آراد',
      'امیرعلی',
      'محمد',
      'پارسا',
      'آرتین',
      'علی',
      'کیان',
      'سامیار',
      'ماهان',
      'امیرحسین',
      'رادین',
      'طاها',
      'آرین',
      'سام',
      'رضا',
      'متین',
      'امیررضا',
      'دانیال',
      'یاسین',
      'نیما',
    ];
    const lastNames = [
      'حسینی',
      'رضایی',
      'محمدی',
      'کریمی',
      'احمدی',
      'مرادی',
      'جعفری',
      'صادقی',
      'موسوی',
      'اکبری',
      'رحیمی',
      'شریفی',
      'عباسی',
      'نجفی',
      'یوسفی',
      'کاظمی',
      'بهرامی',
      'امینی',
      'نعمتی',
      'قاسمی',
    ];
    for (let i = 0; i < 240; i++) {
      const first_name = firstNames[i % 20];
      const last_name = lastNames[(i + Math.floor(i / 20) * 3) % 20];
      const uid = db.insert('users', {
        username: sampleUsername(i === 0 ? 'student' : `student${i + 1}`),
        password_hash: password,
        full_name: `${first_name} ${last_name}`,
        role: 'student',
        phone: `0919${String(1000000 + i)}`,
      });
      const sid = db.insert('students', {
        first_name,
        last_name,
        national_id: String(1000000000 + i),
        class_id: Math.floor(i / 20) + 1,
        birth_date: `${2013 - Math.floor(i / 80)}-${String((i % 12) + 1).padStart(2, '0')}-15`,
        gender: 'male',
        phone: `0919${1000000 + i}`,
        guardian_name: `${i % 5 === 1 ? ['مریم', 'فاطمه', 'زهرا'][i % 3] : ['رضا', 'محمد', 'علی', 'حسین'][i % 4]} ${last_name}`,
        guardian_phone: `0912${1000000 + i}`,
        guardian_relation: i % 5 === 1 ? 'mother' : 'father',
        emergency_phone: `0913${1000000 + i}`,
        address: 'تهران، خیابان شریعتی، محله قلهک',
        blood_type: ['A+', 'B+', 'O+', 'AB+'][i % 4],
        medical_notes: i === 3 ? 'حساسیت به بادام‌زمینی' : null,
        route_id: i % 5 === 0 ? (i % 3) + 1 : null,
        status: 'active',
        user_id: uid,
        author_id: adminId,
      });
      db.run('UPDATE users SET student_id=? WHERE id=?', [sid, uid]);
    }
    const parentId = db.insert('users', {
      username: sampleUsername('parent'),
      password_hash: password,
      full_name: 'رضا حسینی',
      role: 'parent',
      student_id: 1,
      phone: '09121000000',
    });
    db.run('UPDATE students SET guardian_user_id=? WHERE id=1', [parentId]);
    const subjects = [
      'ریاضی',
      'علوم تجربی',
      'فارسی',
      'زبان انگلیسی',
      'مطالعات اجتماعی',
      'پیام‌های آسمان',
      'کار و فناوری',
      'فرهنگ و هنر',
      'تربیت بدنی',
    ];
    subjects.forEach((name, i) =>
      db.insert('subjects', {
        name,
        code: `SUB-${100 + i}`,
        grade: 'all',
        weekly_hours: i < 3 ? 4 : 2,
        description: 'آموزش بر اساس برنامه مصوب',
        author_id: adminId,
      }),
    );
    for (let c = 1; c <= 12; c++)
      for (let day = 0; day < 5; day++)
        for (let p = 0; p < 3; p++)
          db.insert('schedules', {
            title: `زنگ ${['اول', 'دوم', 'سوم'][p]}`,
            class_id: c,
            subject_id: ((day * 3 + p) % 9) + 1,
            teacher_id: c,
            day: String(day),
            start_time: ['08:00', '09:15', '10:30'][p],
            end_time: ['09:00', '10:15', '11:30'][p],
            room: String(c + 100),
            author_id: adminId,
          });
    for (let day = -20; day <= 0; day++) {
      if (new Date(iso(day)).getUTCDay() === 5) continue;
      for (let sid = 1; sid <= 240; sid++) {
        const n = (sid * 7 + Math.abs(day) * 13) % 100;
        const status = n < 93 ? 'present' : n < 96 ? 'absent' : n < 99 ? 'late' : 'excused';
        db.insert('attendance', {
          student_id: sid,
          class_id: Math.floor((sid - 1) / 20) + 1,
          date: iso(day),
          status,
          note: status === 'late' ? 'تأخیر در ورود به کلاس' : '',
          recorded_by: adminId,
        });
      }
    }
    for (let c = 1; c <= 12; c++) {
      db.insert('assignments', {
        title: 'تمرین فصل اول ریاضی',
        class_id: c,
        subject_id: 1,
        teacher_id: c,
        due_date: iso(4),
        max_score: 20,
        description:
          'تمرین‌های صفحه ۱۲ تا ۱۵ کتاب را حل کنید. راه‌حل را به صورت کامل بنویسید و از همین پنل ارسال کنید.',
        status: 'published',
        author_id: adminId,
      });
      db.insert('exams', {
        title: 'ارزشیابی آغاز سال',
        class_id: c,
        subject_id: 1,
        exam_date: iso(-2),
        start_time: '09:00',
        duration: 60,
        max_score: 20,
        location: `کلاس ${100 + c}`,
        type: 'quiz',
        author_id: adminId,
      });
    }
    for (let s = 1; s <= 240; s++)
      for (let sub = 1; sub <= 5; sub++)
        db.insert('grades', {
          title: 'ارزشیابی کلاسی مهرماه',
          student_id: s,
          class_id: Math.floor((s - 1) / 20) + 1,
          subject_id: sub,
          exam_id: sub === 1 ? Math.floor((s - 1) / 20) + 1 : null,
          score: Math.round((14 + ((s * 3 + sub * 7) % 61) / 10) * 10) / 10,
          max_score: 20,
          coefficient: sub < 3 ? 2 : 1,
          term: 'نیم‌سال اول',
          notes: s === 1 ? 'تلاش بسیار خوب، ادامه بده!' : '',
          author_id: adminId,
        });
    const announcements = [
      [
        'جلسه اولیا و مربیان',
        'جلسه آشنایی با برنامه‌های سال تحصیلی روز شنبه، ساعت ۱۶ در سالن اجتماعات برگزار می‌شود. حضور شما باعث دلگرمی ماست.',
        'all',
      ],
      [
        'آغاز ثبت‌نام فعالیت‌های فوق‌برنامه',
        'ثبت‌نام کارگاه رباتیک، خوشنویسی و زبان انگلیسی از این هفته آغاز شده است.',
        'student',
      ],
      [
        'جلسه شورای دبیران',
        'همکاران گرامی، جلسه شورای دبیران چهارشنبه ساعت ۱۳ در اتاق جلسات برگزار می‌شود.',
        'teacher',
      ],
    ];
    announcements.forEach(([title, body, audience], i) =>
      db.insert('announcements', {
        title,
        body,
        audience,
        publish_date: iso(-i),
        author_id: adminId,
      }),
    );
    [
      ['جلسه اولیا و مربیان', 2, 'meeting', 'سالن اجتماعات', '16:00'],
      ['آزمون ریاضی پایه هفتم', 6, 'exam', 'کلاس‌های پایه هفتم', '09:00'],
      ['اردوی علمی باغ کتاب', 9, 'trip', 'باغ کتاب تهران', '08:00'],
      ['کارگاه مهارت‌های زندگی', 12, 'workshop', 'سالن شماره ۲', '10:00'],
    ].forEach(([title, offset, type, location, start_time]) =>
      db.insert('events', {
        title,
        start_date: iso(offset),
        type,
        location,
        start_time,
        description: 'برنامه هماهنگ‌شده مدرسه برای دانش‌آموزان و خانواده‌ها',
        author_id: adminId,
      }),
    );
    for (let s = 1; s <= 240; s++) {
      const iid = db.insert('invoices', {
        title: 'شهریه نیم‌سال اول',
        student_id: s,
        amount: 15000000,
        due_date: iso(14),
        term: '۱۴۰۵–۱۴۰۶',
        status: 'unpaid',
        paid_amount: 0,
        author_id: adminId,
      });
      if (s % 3 !== 0) {
        const amount = s % 2 === 0 ? 15000000 : 7500000;
        db.insert('payments', {
          invoice_id: iid,
          amount,
          payment_date: iso(-3),
          method: 'transfer',
          reference: `PAY-${14050000 + s}`,
          author_id: adminId,
        });
        db.run('UPDATE invoices SET paid_amount=?,status=? WHERE id=?', [
          amount,
          amount === 15000000 ? 'paid' : 'partial',
          iid,
        ]);
      }
    }
    [
      ['خرید تجهیزات آزمایشگاه', 'supplies', 4500000],
      ['تعمیر سیستم گرمایشی', 'maintenance', 2300000],
      ['قبض برق مهرماه', 'utilities', 850000],
    ].forEach(([title, category, amount]) =>
      db.insert('expenses', { title, category, amount, expense_date: iso(-2), author_id: adminId }),
    );
    [
      ['شازده کوچولو', 'آنتوان دو سنت‌اگزوپری', 'داستان'],
      ['قصه‌های مجید', 'هوشنگ مرادی کرمانی', 'داستان'],
      ['دانستنی‌های علم', 'گروه نویسندگان', 'علمی'],
      ['شاهنامه نوجوانان', 'فردوسی', 'ادبیات'],
      ['چرا و چگونه', 'گروه نویسندگان', 'علمی'],
      ['دنیای ریاضی', 'ایان استوارت', 'آموزشی'],
    ].forEach(([title, author, category], i) =>
      db.insert('books', {
        title,
        author,
        category,
        isbn: `97860012345${i}7`,
        copies: 8,
        shelf: `A-${i + 1}`,
        author_id: adminId,
      }),
    );
    for (let i = 1; i <= 12; i++)
      db.insert('loans', {
        book_id: (i % 6) + 1,
        student_id: i,
        borrow_date: iso(-5),
        due_date: iso(5),
        return_date: i % 4 === 0 ? iso(-1) : null,
        author_id: adminId,
      });
    [
      ['ویدئوپروژکتور', 'دیجیتال', 12, 'کلاس‌های آموزشی'],
      ['میکروسکوپ', 'آزمایشگاهی', 8, 'آزمایشگاه علوم'],
      ['رایانه', 'دیجیتال', 20, 'کارگاه فناوری'],
    ].forEach(([name, category, quantity, location], i) =>
      db.insert('inventory', {
        name,
        category,
        quantity,
        location,
        serial_no: `INV-${1000 + i}`,
        condition: 'good',
        author_id: adminId,
      }),
    );
    db.insert('counseling', {
      student_id: 3,
      title: 'برنامه‌ریزی درسی',
      counselor: 'نگین کاظمی',
      session_date: iso(2),
      notes: 'جلسه برای شناخت روش مطالعه مناسب',
      status: 'planned',
      author_id: adminId,
    });
    db.insert('discipline', {
      student_id: 1,
      title: 'همکاری در فعالیت گروهی',
      record_date: iso(-2),
      type: 'positive',
      action: 'تقدیر در کلاس',
      author_id: adminId,
    });
    db.insert('health', {
      student_id: 1,
      title: 'معاینه آغاز سال تحصیلی',
      check_date: iso(-7),
      type: 'checkup',
      description: 'وضعیت عمومی مناسب',
      recommendation: 'معاینه دوره‌ای سالانه',
      author_id: adminId,
    });
    const sampleDocument = Buffer.from(
      'گواهی نمونه اشتغال به تحصیل\nآراد حسینی، دانش‌آموز پایه هفتم دبیرستان اندیشه.\nاین فایل صرفاً داده نمایشی است.\n',
      'utf8',
    );
    fs.mkdirSync(path.join(db.dir, 'uploads'), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(db.dir, 'uploads', 'demo-document.txt'), sampleDocument, {
      mode: 0o600,
    });
    const sampleFileId = db.insert('files', {
      owner_id: adminId,
      original_name: 'گواهی نمونه.txt',
      stored_name: 'demo-document.txt',
      mime: 'text/plain',
      size: sampleDocument.length,
    });
    db.insert('documents', {
      student_id: 1,
      title: 'گواهی اشتغال به تحصیل (نمونه)',
      type: 'educational',
      file_id: sampleFileId,
      notes: 'صرفاً جهت نمایش کارکرد پرونده',
      author_id: adminId,
    });
    for (let c = 1; c <= 12; c++)
      db.insert('submissions', {
        assignment_id: c,
        student_id: (c - 1) * 20 + 1,
        body: 'تمرین‌های فصل اول حل شد. در سؤال سوم با روش جدول‌بندی به پاسخ رسیدم.',
        score: c % 2 ? 18.5 : null,
        allow_resubmit: c === 1 ? 1 : 0,
        reviewed_at: c % 2 ? timestamp(0) : null,
        feedback: c % 2 ? 'راه‌حل دقیق و مرتب، آفرین!' : null,
      });
    teachers.forEach((_, i) =>
      db.insert('payroll', {
        teacher_id: i + 1,
        month: 'مهر ۱۴۰۵',
        gross: 25000000,
        deductions: 1800000,
        status: i < 10 ? 'paid' : 'pending',
        payment_date: i < 10 ? iso(-1) : null,
        author_id: adminId,
      }),
    );
    db.insert('visitors', {
      full_name: 'رضا حسینی',
      phone: '09121000000',
      purpose: 'دیدار با معلم راهنما',
      host: 'سارا محمدی',
      visit_date: iso(0),
      entry_time: '09:30',
      exit_time: '10:00',
      author_id: adminId,
    });
    db.insert('terms', {
      name: '۱۴۰۵–۱۴۰۶',
      start_date: '2026-09-23',
      end_date: '2027-06-22',
      status: 'current',
      author_id: adminId,
    });
    ['آزمایشگاه علوم', 'کارگاه فناوری', 'سالن اجتماعات', 'کلاس ۱۰۱'].forEach((name, i) =>
      db.insert('rooms', {
        name,
        type: ['lab', 'workshop', 'hall', 'classroom'][i],
        capacity: [25, 20, 150, 30][i],
        building: 'ساختمان اصلی',
        author_id: adminId,
      }),
    );
    const teacherId = db.get("SELECT id FROM users WHERE username='teacher'").id;
    const studentId = db.get("SELECT id FROM users WHERE username='student'").id;
    const ticketSamples = [
      [
        studentId,
        teacherId,
        'درخواست بررسی نمره ریاضی',
        'education',
        'normal',
        'in_progress',
        'سلام خانم محمدی، ممکن است پاسخ سؤال سوم آزمون من را دوباره بررسی کنید؟ ممنونم.',
      ],
      [
        parentId,
        adminId,
        'هماهنگی جلسه با مدیر مدرسه',
        'general',
        'normal',
        'open',
        'سلام، برای صحبت درباره برنامه‌های فوق‌برنامه فرزندم درخواست جلسه دارم.',
      ],
      [
        studentId,
        adminId,
        'درخواست گواهی اشتغال به تحصیل',
        'administrative',
        'low',
        'open',
        'سلام، برای ثبت‌نام در مسابقات ورزشی به گواهی اشتغال به تحصیل نیاز دارم.',
      ],
      [
        db.get("SELECT id FROM users WHERE username='student2'").id,
        adminId,
        'سؤال درباره سرویس مدرسه',
        'services',
        'high',
        'open',
        'ساعت حرکت سرویس مسیر قلهک برای هفته آینده چه زمانی است؟',
      ],
      [
        teacherId,
        adminId,
        'تجهیزات کلاس ریاضی',
        'services',
        'normal',
        'resolved',
        'لطفاً برای کلاس هفتم ۱ یک تخته شطرنجی تهیه کنید.',
      ],
    ];
    ticketSamples.forEach(
      ([sender_id, recipient_id, title, category, priority, status, body], i) => {
        const tid = db.insert('tickets', {
          sender_id,
          recipient_id,
          title,
          category,
          priority,
          status,
          created_at: timestamp(-i),
          updated_at: timestamp(-i),
        });
        db.insert('ticket_messages', {
          ticket_id: tid,
          sender_id,
          body,
          created_at: timestamp(-i),
        });
        if (i === 0)
          db.insert('ticket_messages', {
            ticket_id: tid,
            sender_id: teacherId,
            body: 'سلام آراد جان، حتماً بررسی می‌کنم. فردا در کلاس درباره راه‌حل صحبت می‌کنیم.',
          });
      },
    );
    [
      ['جلسه اولیا و مربیان', 'جلسه روز شنبه ساعت ۱۶ در سالن اجتماعات', 'calendar', '/calendar'],
      ['۳ تیکت در انتظار پاسخ', 'دانش‌آموزان و اولیا منتظر پاسخ شما هستند.', 'ticket', '/tickets'],
      [
        'حضور و غیاب امروز ثبت شد',
        'گزارش کلاس‌ها برای بررسی آماده است.',
        'attendance',
        '/attendance',
      ],
    ].forEach(([title, body, type, link]) =>
      db.insert('notifications', { user_id: adminId, title, body, type, link }),
    );
    [teacherId, studentId, parentId].forEach((user_id) =>
      db.insert('notifications', {
        user_id,
        title: 'به مدرسه‌یار خوش آمدید',
        body: 'سال تحصیلی جدید را با هم آغاز می‌کنیم.',
        type: 'info',
        link: '/',
      }),
    );
    db.insert('audit', {
      actor_id: adminId,
      action: 'install.demo',
      entity: 'school',
      detail: 'داده‌های نمونه برای شروع سریع آماده شد.',
    });
    db.setSetting('installed', true);
    db.setSetting('demo_seeded', true);
    return adminId;
  });
}
