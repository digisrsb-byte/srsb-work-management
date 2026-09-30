import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import multer from 'multer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadsRoot = path.resolve(
  __dirname,
  '../../uploads/onboarding'
);

const maxMb = Number(process.env.UPLOAD_MAX_MB || 10);

if (!fs.existsSync(uploadsRoot)) {
  fs.mkdirSync(uploadsRoot, { recursive: true });
}

// Files stay in memory until the request is authorised and validated, so rejected
// uploads never touch the disk.
const storage = multer.memoryStorage();

const allowedMime = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

export const onboardingUpload = multer({
  storage,
  limits: {
    fileSize: maxMb * 1024 * 1024
  },
  fileFilter(req, file, cb) {
    if (!allowedMime.has(file.mimetype)) {
      cb(new Error('Unsupported file type. Use PDF, JPG, PNG, WEBP or DOC/DOCX.'));
      return;
    }
    cb(null, true);
  }
});

export { maxMb };

// The browser-supplied MIME type is easy to fake, so the first bytes must match it too.
const SIGNATURES = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  'application/msword': [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [[0x50, 0x4b, 0x03, 0x04]]
};

export function fileMatchesDeclaredType(file) {
  const expected = SIGNATURES[file?.mimetype];
  if (!expected || !file.buffer || file.buffer.length < 4) return false;
  const header = file.buffer.subarray(0, 12);
  const matches = expected.some((sig) => sig.every((byte, i) => header[i] === byte));
  if (!matches) return false;
  if (file.mimetype === 'image/webp') {
    return header.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  if (file.mimetype === 'application/pdf') {
    return isCompletePdf(file.buffer);
  }
  return true;
}

// Truncated or hand-made PDFs pass the header check but cannot be opened by reviewers.
function isCompletePdf(buffer) {
  const tail = buffer.subarray(Math.max(0, buffer.length - 2048)).toString('latin1');
  return tail.includes('startxref') && tail.includes('%%EOF');
}

// Writes an accepted in-memory upload to storage and records where it went on the file object.
export function persistUpload(file) {
  const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safe}`;
  const target = path.join(uploadsRoot, filename);
  fs.writeFileSync(target, file.buffer, { flag: 'wx' });
  file.filename = filename;
  file.path = target;
  return file;
}

export function removeUploadedFile(file) {
  if (!file?.path) return;
  try {
    fs.rmSync(file.path, { force: true });
  } catch (error) {
    console.warn(`Could not remove rejected upload ${file.path}: ${error.message}`);
  }
}

export function uploadErrorMessage(error) {
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return `The file is larger than ${maxMb} MB. Upload a smaller file.`;
  }
  if (error?.code === 'LIMIT_UNEXPECTED_FILE') {
    return 'Upload one file in the "file" field.';
  }
  return error?.message || 'The file could not be uploaded.';
}
