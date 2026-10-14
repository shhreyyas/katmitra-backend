const { getRequestedLanguage } = require("./localization");
const { translateMessage } = require("./messageTranslations");

/** Response messages follow the caller's language (Accept-Language / x-language). */
function localize(res, message) {
  return res.req ? translateMessage(message, getRequestedLanguage(res.req)) : message;
}

exports.successResponse = (res, message, data = null, statusCode = 200, extras = undefined) => {
  const body = { success: true, message: localize(res, message), data };
  if (extras != null && typeof extras === "object") {
    Object.assign(body, extras);
  }
  return res.status(statusCode).json(body);
};

exports.errorResponse = (
  res,
  message,
  statusCode = 200,
  errorCode = "ERROR",
  detailMessage,
) => {
  const errMsg = localize(res, detailMessage !== undefined ? detailMessage : message);
  return res.status(statusCode).json({
    success: false,
    message: localize(res, message),
    error: {
      code: errorCode,
      message: errMsg,
    },
  });
};
