export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
}

// Database errors carry the SQL text with bound values, and some messages quote the value
// itself (for example duplicate entries), so only a summary is logged or returned.
function isDatabaseError(error) {
  return typeof error?.sqlMessage === 'string' || typeof error?.sql === 'string';
}

function logError(error, req, statusCode) {
  const route = `${req.method} ${req.originalUrl.split('?')[0]}`;
  if (statusCode < 500 && !isDatabaseError(error)) {
    console.warn(`[${statusCode}] ${route} - ${error.message}`);
    return;
  }
  const message = error.code === 'ER_DUP_ENTRY' ? 'Duplicate entry (value redacted)' : error.message;
  const frames = String(error.stack || '').split('\n').slice(1, 6).join('\n');
  console.error(`[${statusCode}] ${route} - ${error.name || 'Error'}${error.code ? ` ${error.code}` : ''}: ${message}\n${frames}`);
}

export function errorHandler(error, req, res, next) {
  const statusCode = error.statusCode || 500;
  logError(error, req, statusCode);

  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      success: false,
      message: 'This record already exists. Please use a unique value.'
    });
  }

  if (error.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({
      success: false,
      message: 'The selected related record does not exist.'
    });
  }

  res.status(statusCode).json({
    success: false,
    message: isDatabaseError(error)
      ? 'An unexpected error occurred.'
      : error.message || 'An unexpected error occurred.',
    details: error.details
  });
}
