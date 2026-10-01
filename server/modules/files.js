import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { assert, scope, log, positiveId, recordPermissions } from '../security.js';
import { resourceDefs } from '../../shared/catalog.js';
export function filesRouter(db, security) {
  const router = Router();
  router.use(security.auth);
  const maxMB = Math.max(1, Math.min(20, Number(process.env.MAX_UPLOAD_MB) || 5));
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMB * 1024 * 1024, files: 1 },
  });
  const permission = (req, _res, next) => {
    const context = req.query.context;
    const can = (id) => security.enabled(id);
    let allowed = false;
    if (context === 'tickets')
      allowed = can('tickets.attachments') && (can('tickets.create') || can('tickets.reply'));
    if (context === 'documents')
      allowed =
        resourceDefs.documents.write.includes(req.user.role) &&
        (can('documents.create') || can('documents.edit'));
    if (context === 'assignments')
      allowed =
        ['admin', 'teacher'].includes(req.user.role) &&
        (can('assignments.create') || can('assignments.edit'));
    if (context === 'submission')
      allowed = req.user.role === 'student' && can('assignments.submit');
    assert(allowed, 403, 'بارگذاری فایل برای این قابلیت در دسترس نیست.');
    const recent = db.get(
      "SELECT COUNT(*) n FROM files WHERE owner_id=? AND created_at>=datetime('now','-1 day')",
      [req.user.id],
    ).n;
    assert(recent < 50, 429, 'سقف روزانه بارگذاری فایل پر شده است.');
    next();
  };
  router.post('/', permission, upload.single('file'), security.auth, permission, (req, res) => {
    assert(req.file, 422, 'فایل را انتخاب کنید.');
    const file = req.file,
      ext = path.extname(file.originalname).toLowerCase(),
      b = file.buffer;
    const types = {
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.txt': 'text/plain',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    assert(types[ext], 422, 'فرمت مجاز: PDF، PNG، JPG، WEBP، TXT و DOCX.');
    const signature =
      ext === '.pdf'
        ? b.subarray(0, 5).toString() === '%PDF-'
        : ext === '.png'
          ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : ['.jpg', '.jpeg'].includes(ext)
            ? b[0] === 255 && b[1] === 216 && b[2] === 255
            : ext === '.webp'
              ? b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP'
              : ext === '.docx'
                ? b[0] === 80 && b[1] === 75
                : !b.includes(0);
    assert(signature && b.length > 0, 422, 'محتوای فایل با پسوند آن مطابقت ندارد.');
    const stored_name = `${crypto.randomUUID()}${ext}`;
    const decodedName = /^[\u0000-\u00FF]*$/.test(file.originalname)
      ? Buffer.from(file.originalname, 'latin1').toString('utf8')
      : file.originalname;
    const original_name =
      path
        .basename(decodedName.includes('\uFFFD') ? file.originalname : decodedName)
        .replace(/[\u0000-\u001F]/g, '')
        .slice(0, 180) || `file${ext}`;
    const filename = path.join(db.dir, 'uploads', stored_name);
    fs.writeFileSync(filename, b, { mode: 0o600 });
    let id;
    try {
      db.transaction(() => {
        id = db.insert('files', {
          owner_id: req.user.id,
          context: req.query.context,
          original_name,
          stored_name,
          mime: types[ext],
          size: b.length,
        });
        log(db, req.user, 'files.upload', 'files', id, original_name);
      });
    } catch (error) {
      fs.unlinkSync(filename);
      throw error;
    }
    res.status(201).json({ id, name: original_name, size: b.length });
  });
  router.get('/:id', (req, res) => {
    const file = db.get('SELECT * FROM files WHERE id=?', [positiveId(req.params.id)]);
    assert(file, 404, 'فایل پیدا نشد.');
    const ticketLinks = db.all(
      'SELECT t.* FROM ticket_messages m JOIN tickets t ON t.id=m.ticket_id WHERE m.file_id=?',
      [file.id],
    );
    const documentLinks = db.all('SELECT * FROM documents WHERE file_id=?', [file.id]);
    const assignmentLinks = db.all('SELECT * FROM assignments WHERE file_id=?', [file.id]);
    const submissionLinks = db.all(
      'SELECT s.*,a.id assignment_record_id FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.file_id=?',
      [file.id],
    );
    const linked =
      ticketLinks.length + documentLinks.length + assignmentLinks.length + submissionLinks.length;
    let allowed = false;
    if (security.enabled('tickets.attachments'))
      allowed ||= ticketLinks.some(
        (ticket) =>
          req.user.role === 'admin' ||
          [ticket.sender_id, ticket.recipient_id].includes(req.user.id),
      );
    for (const [resource, links] of [
      ['documents', documentLinks],
      ['assignments', assignmentLinks],
    ]) {
      if (
        !security.enabled(`${resource}.view`) ||
        !resourceDefs[resource].read.includes(req.user.role)
      )
        continue;
      const s = scope(db, resource, req.user);
      allowed ||= links.some(
        (row) =>
          !!db.get(`SELECT r.id FROM "${resource}" r WHERE r.id=? AND (${s.sql})`, [
            row.id,
            ...s.params,
          ]),
      );
    }
    if (security.enabled('assignments.view')) {
      for (const submission of submissionLinks) {
        const row = db.get('SELECT * FROM assignments WHERE id=?', [submission.assignment_id]);
        const s = scope(db, 'assignments', req.user);
        if (
          !db.get(`SELECT r.id FROM assignments r WHERE r.id=? AND (${s.sql})`, [
            row.id,
            ...s.params,
          ])
        )
          continue;
        if (['student', 'parent'].includes(req.user.role))
          allowed ||= submission.student_id === req.user.student_id;
        else allowed ||= recordPermissions(db, security, 'assignments', row, req.user).review;
      }
    }
    // Ownership only grants access to a not-yet-attached upload in its enabled context.
    // Once linked, current record scope is mandatory, even for the original uploader.
    if (!linked && file.owner_id === req.user.id) {
      const ownContexts = {
        tickets: security.enabled('tickets.attachments'),
        documents:
          resourceDefs.documents.write.includes(req.user.role) &&
          security.enabled('documents.view'),
        assignments:
          ['admin', 'teacher'].includes(req.user.role) && security.enabled('assignments.view'),
        submission: req.user.role === 'student' && security.enabled('assignments.view'),
      };
      allowed ||= !!ownContexts[file.context];
    }
    assert(allowed, 403, 'این فایل خصوصی است.');
    const filename = path.resolve(db.dir, 'uploads', file.stored_name);
    assert(
      filename.startsWith(path.resolve(db.dir, 'uploads') + path.sep) && fs.existsSync(filename),
      404,
      'فایل در ذخیره‌سازی موجود نیست.',
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.type(file.mime).download(filename, file.original_name);
  });
  return router;
}
