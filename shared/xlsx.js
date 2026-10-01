// Minimal, dependency-light XLSX writer (Office Open XML spreadsheet).
// Uses fflate for the ZIP container and inline strings so no shared-string table is needed.
import { zipSync, strToU8 } from 'fflate';

const escapeXml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Excel rejects control characters inside XML 1.0.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const columnName = (index) => {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const rest = (n - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
};

const cellXml = (value, ref) => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value))
    return `<c r="${ref}"><v>${value}</v></c>`;
  if (typeof value === 'boolean') return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  // A leading apostrophe-style guard keeps spreadsheet formula injection impossible.
  const text = String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(guarded)}</t></is></c>`;
};

export function sheetXml(rows) {
  const body = rows
    .map((row, r) => {
      const cells = row.map((value, c) => cellXml(value, `${columnName(c)}${r + 1}`)).join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  const width = Math.max(1, ...rows.map((row) => row.length));
  const cols = `<cols>${Array.from(
    { length: width },
    (_, i) => `<col min="${i + 1}" max="${i + 1}" width="${i === 0 ? 22 : 16}" customWidth="1"/>`,
  ).join('')}</cols>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetFormatPr defaultRowHeight="18"/>${cols}<sheetData>${body}</sheetData></worksheet>`;
}

/**
 * Build an XLSX file from `{ name, rows }` sheets.
 * The first row of each sheet is treated as the header and receives bold styling.
 */
export function buildXlsx(sheets) {
  const list = sheets.filter((sheet) => sheet?.rows?.length);
  if (!list.length) throw new Error('xlsx: at least one non-empty sheet is required');
  const sheetFiles = {};
  const overrides = [];
  const rels = [];
  list.forEach((sheet, index) => {
    const path = `xl/worksheets/sheet${index + 1}.xml`;
    sheetFiles[path] = strToU8(sheetXml(sheet.rows));
    overrides.push(
      `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    );
    rels.push(
      `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    );
  });
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${list
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml((sheet.name || `Sheet${index + 1}`).slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 2}"/>`,
    )
    .join('')}</sheets></workbook>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const files = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides.join('')}</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(styles),
    ...sheetFiles,
  };
  // Fixed mtime (inside the ZIP epoch) keeps builds byte-stable for the same data.
  return Buffer.from(zipSync(files, { level: 6, mtime: new Date('2000-01-01T00:00:00Z') }));
}

/** Turn the same `{ columns, rows }` shape used by the CSV export into sheets. */
export function sheetsFromRows(columns, rows, name = 'Sheet1') {
  const header = columns.map((column) => column.label);
  const body = rows.map((row) => columns.map((column) => row[column.key]));
  return [{ name, rows: [header, ...body] }];
}
