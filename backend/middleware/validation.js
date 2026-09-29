// ============================================================================
// Wraps a validator function (from utils/validators.js) into Express
// middleware that returns a consistent 400 VALIDATION_ERROR response.
// ============================================================================
function validate(validatorFn, options) {
  return (req, res, next) => {
    const result = validatorFn(req.body, options);
    if (!result.valid) {
      return res.status(400).json({
        success: false,
        error: {
          message: result.errors.join(' '),
          code: 'VALIDATION_ERROR',
          details: result.errors,
        },
      });
    }
    return next();
  };
}

module.exports = { validate };
