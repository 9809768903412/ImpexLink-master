function notFound(req, res, next) {
  res.status(404).json({ error: `Not found: ${req.originalUrl}` });
}

function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  const message = err.message || 'Internal server error';
  // Log full error for debugging
  console.error(err);
  res.status(status).json({
    error: message,
    code: status,
  });
}

module.exports = { notFound, errorHandler };
