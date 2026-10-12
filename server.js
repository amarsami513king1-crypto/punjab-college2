'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { Pool } = require('pg');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const SESSION_COOKIE = 'pnc_admin_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const SUBJECTS = [
  { key: 'english', label: 'English' },
  { key: 'urdu', label: 'Urdu' },
  { key: 'subjectThree', label: 'Biology / Mathematics / Psychology' },
  { key: 'subjectFour', label: 'Computer / Chemistry / Statistics' },
  { key: 'subjectFive', label: 'Physics / Civics' },
  { key: 'quran', label: 'T.Q. (Tarjuma-tul-Quran)' },
  { key: 'islamiat', label: 'Islamiat' }
];

const requiredEnvironment = ['DATABASE_URL', 'ADMIN_USERNAME', 'ADMIN_PASSWORD', 'SESSION_SECRET'];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
if (missingEnvironment.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvironment.join(', ')}`);
}
if (process.env.SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET must be at least 32 characters long.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};
const PUBLIC_FILES = new Set([
  'index.html',
  'admin.html',
  'login.html',
  'styles.css',
  'app.js',
  'assets/college-logo.png'
]);

function sendJSON(response, statusCode, data, headers = {}) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  response.end(JSON.stringify(data));
}

function sendError(response, statusCode, message) {
  sendJSON(response, statusCode, { error: message });
}

function readRequestJSON(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 }));
      }
    });
    request.on('error', reject);
  });
}

function secureEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createSessionToken() {
  const payload = Buffer.from(JSON.stringify({
    username: process.env.ADMIN_USERNAME,
    expires: Date.now() + SESSION_TTL_SECONDS * 1000
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function isAuthenticated(request) {
  const cookieHeader = request.headers.cookie || '';
  const cookies = Object.fromEntries(cookieHeader.split(';').map((cookie) => {
    const separator = cookie.indexOf('=');
    return separator < 0
      ? ['', '']
      : [cookie.slice(0, separator).trim(), cookie.slice(separator + 1).trim()];
  }).filter(([key]) => key));
  const token = cookies[SESSION_COOKIE];
  if (!token) return false;

  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return false;
  const expectedSignature = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
  if (!secureEqual(signature, expectedSignature)) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return session.username === process.env.ADMIN_USERNAME && session.expires > Date.now();
  } catch {
    return false;
  }
}

function cookieHeader(value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function nullableNumber(value, label, errors) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) errors.push(`${label} must be a non-negative number.`);
  return number;
}

function validateRecord(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { errors: ['A result record is required.'] };
  }

  const stringField = (key, label, maxLength, required = false) => {
    const value = typeof input[key] === 'string' ? input[key].trim() : '';
    if (required && !value) errors.push(`${label} is required.`);
    if (value.length > maxLength) errors.push(`${label} must be ${maxLength} characters or fewer.`);
    return value;
  };
  const id = stringField('id', 'Record ID', 100, true);
  const name = stringField('name', 'Name', 120, true);
  const fatherName = stringField('fatherName', 'Father Name', 120, true);
  const rollNumber = stringField('rollNumber', 'Roll Number', 40, true);
  const className = stringField('className', 'Class', 60, true);
  const section = stringField('section', 'Section', 40);
  const date = stringField('date', 'Date', 30);
  const remarks = stringField('remarks', 'Remarks', 240);

  const markValues = {};
  for (const subject of SUBJECTS) {
    const value = input.marks?.[subject.key] || {};
    const total = nullableNumber(value.total, `${subject.label} total marks`, errors);
    const obtained = nullableNumber(value.obtained, `${subject.label} obtained marks`, errors);
    if ((total === null) !== (obtained === null)) {
      errors.push(`Enter both marks or leave both blank for ${subject.label}.`);
    }
    if (total !== null && total <= 0) errors.push(`${subject.label} total marks must be greater than zero.`);
    if (total !== null && obtained !== null && obtained > total) {
      errors.push(`${subject.label} obtained marks cannot exceed its total marks.`);
    }
    markValues[subject.key] = { total, obtained };
  }

  const totalMarks = nullableNumber(input.totalMarks, 'Overall total marks', errors);
  const obtainedMarks = nullableNumber(input.obtainedMarks, 'Overall obtained marks', errors);
  if ((totalMarks === null) !== (obtainedMarks === null)) {
    errors.push('Enter both overall marks or leave both blank.');
  }
  if (totalMarks !== null && totalMarks <= 0) errors.push('Overall total marks must be greater than zero.');
  if (totalMarks !== null && obtainedMarks !== null && obtainedMarks > totalMarks) {
    errors.push('Overall obtained marks cannot exceed total marks.');
  }

  return {
    errors,
    record: {
      id,
      name,
      fatherName,
      rollNumber,
      className,
      section,
      date,
      remarks,
      marks: markValues,
      totalMarks,
      obtainedMarks
    }
  };
}

async function getPassPercentage() {
  const result = await pool.query("SELECT value FROM portal_settings WHERE key = 'pass_percentage'");
  return result.rowCount === 0 ? 33 : Number(result.rows[0].value);
}

function addResultSummary(record, passPercentage) {
  const percentage = record.totalMarks !== null && record.obtainedMarks !== null && record.totalMarks > 0
    ? (record.obtainedMarks / record.totalMarks) * 100
    : null;
  const subjects = Object.values(record.marks);
  const incomplete = subjects.some(({ total, obtained }) => (total === null) !== (obtained === null));
  const subjectFail = subjects.some(({ total, obtained }) =>
    total !== null && obtained !== null && (obtained / total) * 100 < passPercentage
  );
  const status = percentage === null || incomplete
    ? 'Pending'
    : subjectFail || percentage < passPercentage
      ? 'Fail'
      : 'Pass';
  return { ...record, percentage, resultStatus: status };
}

async function handleAPI(request, response, pathname) {
  if (pathname === '/api/health' && request.method === 'GET') {
    await pool.query('SELECT 1');
    return sendJSON(response, 200, { status: 'ok' });
  }

  if (pathname === '/api/session' && request.method === 'GET') {
    return sendJSON(response, 200, { authenticated: isAuthenticated(request) });
  }

  if (pathname === '/api/session' && request.method === 'POST') {
    const credentials = await readRequestJSON(request);
    const username = typeof credentials.username === 'string' ? credentials.username.trim() : '';
    const password = typeof credentials.password === 'string' ? credentials.password : '';
    if (!secureEqual(username, process.env.ADMIN_USERNAME) || !secureEqual(password, process.env.ADMIN_PASSWORD)) {
      return sendError(response, 401, 'The username or password is incorrect.');
    }
    return sendJSON(response, 200, { authenticated: true }, {
      'Set-Cookie': cookieHeader(createSessionToken(), SESSION_TTL_SECONDS)
    });
  }

  if (pathname === '/api/session' && request.method === 'DELETE') {
    return sendJSON(response, 200, { authenticated: false }, {
      'Set-Cookie': cookieHeader('', 0)
    });
  }

  if (pathname.startsWith('/api/admin/') && !isAuthenticated(request)) {
    return sendError(response, 401, 'Sign in to access administrator functions.');
  }

  if (pathname === '/api/results' && request.method === 'GET') {
    const rollNumber = new URL(request.url, 'http://localhost').searchParams.get('roll');
    if (!rollNumber || rollNumber.length > 40) return sendError(response, 400, 'Enter a valid roll number.');
    const result = await pool.query(
      "SELECT payload FROM student_results WHERE roll_key = lower(btrim($1))",
      [rollNumber]
    );
    if (result.rowCount === 0) return sendError(response, 404, 'No result was found for that roll number.');
    return sendJSON(response, 200, addResultSummary(result.rows[0].payload, await getPassPercentage()));
  }

  if (pathname === '/api/admin/settings' && request.method === 'GET') {
    return sendJSON(response, 200, { passPercentage: await getPassPercentage() });
  }

  if (pathname === '/api/admin/settings' && request.method === 'PUT') {
    const settings = await readRequestJSON(request);
    const percentage = Number(settings.passPercentage);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      return sendError(response, 400, 'Passing percentage must be between 0 and 100.');
    }
    await pool.query(
      `INSERT INTO portal_settings (key, value)
       VALUES ('pass_percentage', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(percentage)]
    );
    return sendJSON(response, 200, { passPercentage: percentage });
  }

  if (pathname === '/api/admin/results' && request.method === 'GET') {
    const result = await pool.query('SELECT payload FROM student_results ORDER BY lower(payload->>\'name\')');
    const passPercentage = await getPassPercentage();
    return sendJSON(response, 200, result.rows.map((row) => addResultSummary(row.payload, passPercentage)));
  }

  if (pathname === '/api/admin/results' && request.method === 'POST') {
    const input = await readRequestJSON(request);
    const { errors, record } = validateRecord(input);
    if (errors.length) return sendJSON(response, 400, { error: errors.join(' ') });
    const completeRecord = addResultSummary(record, await getPassPercentage());
    try {
      await pool.query(
        `INSERT INTO student_results (id, roll_key, payload)
         VALUES ($1, lower(btrim($2)), $3::jsonb)`,
        [completeRecord.id, completeRecord.rollNumber, JSON.stringify(completeRecord)]
      );
    } catch (error) {
      if (error.code === '23505') return sendError(response, 409, 'That roll number is already saved.');
      throw error;
    }
    return sendJSON(response, 201, completeRecord);
  }

  const resultMatch = pathname.match(/^\/api\/admin\/results\/([^/]+)$/);
  if (resultMatch && request.method === 'PUT') {
    const id = decodeURIComponent(resultMatch[1]);
    const input = await readRequestJSON(request);
    const { errors, record } = validateRecord(input);
    if (errors.length) return sendJSON(response, 400, { error: errors.join(' ') });
    if (record.id !== id) return sendError(response, 400, 'The result ID does not match the requested record.');
    const completeRecord = addResultSummary(record, await getPassPercentage());
    try {
      const result = await pool.query(
        `UPDATE student_results
         SET roll_key = lower(btrim($2)), payload = $3::jsonb, updated_at = now()
         WHERE id = $1`,
        [id, completeRecord.rollNumber, JSON.stringify(completeRecord)]
      );
      if (result.rowCount === 0) return sendError(response, 404, 'That result was not found.');
    } catch (error) {
      if (error.code === '23505') return sendError(response, 409, 'That roll number is already saved.');
      throw error;
    }
    return sendJSON(response, 200, completeRecord);
  }

  if (resultMatch && request.method === 'DELETE') {
    const id = decodeURIComponent(resultMatch[1]);
    const result = await pool.query('DELETE FROM student_results WHERE id = $1', [id]);
    if (result.rowCount === 0) return sendError(response, 404, 'That result was not found.');
    return sendJSON(response, 200, { deleted: true });
  }

  if (pathname.startsWith('/api/')) return sendError(response, 404, 'API endpoint not found.');
  return null;
}

async function serveStatic(response, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    response.writeHead(400);
    return response.end('Invalid URL.');
  }
  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  if (!PUBLIC_FILES.has(relativePath)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return response.end('Page not found.');
  }
  const filePath = path.resolve(ROOT, relativePath);
  const relativeToRoot = path.relative(ROOT, filePath);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    response.writeHead(403);
    return response.end('Forbidden.');
  }
  try {
    const file = await fs.promises.readFile(filePath);
    response.writeHead(200, {
      'Cache-Control': ['.html', '.js', '.css'].includes(path.extname(filePath)) ? 'no-cache' : 'public, max-age=3600',
      'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(file);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return response.end('Page not found.');
    }
    throw error;
  }
}

async function handleRequest(request, response) {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const result = await handleAPI(request, response, url.pathname);
      if (result === null) sendError(response, 404, 'API endpoint not found.');
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      return response.end('Method not allowed.');
    }
    await serveStatic(response, url.pathname);
  } catch (error) {
    console.error('Request failed:', error);
    if (!response.headersSent) sendError(response, error.statusCode || 500, error.statusCode ? error.message : 'The server could not complete the request.');
    else response.destroy(error);
  }
}

async function start() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_results (
      id text PRIMARY KEY,
      roll_key text NOT NULL UNIQUE,
      payload jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS portal_settings (
      key text PRIMARY KEY,
      value jsonb NOT NULL
    )
  `);
  const server = http.createServer(handleRequest);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Punjab College Results server listening on port ${PORT}`);
  });
  const shutdown = () => {
    server.close(() => pool.end().finally(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((error) => {
  console.error('Server startup failed:', error);
  process.exitCode = 1;
});
