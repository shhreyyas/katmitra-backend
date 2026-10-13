// GSTIN: 2-digit state code, 10-char PAN, entity code, "Z", checksum.
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * GST is optional wherever it is accepted. Returns the upper-cased value
 * ("" when blank), or null when a value was given but is not a valid GSTIN.
 */
function normalizeGstNumber(raw) {
  const value = String(raw ?? "").trim().toUpperCase();
  if (!value) return "";
  return GST_REGEX.test(value) ? value : null;
}

/**
 * Optional 10-digit mobile number. Returns the digits, "" when blank, or null
 * when something was given that is not exactly 10 digits.
 */
function normalizeOptionalPhone(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  return digits.length === 10 ? digits : null;
}

module.exports = { normalizeGstNumber, normalizeOptionalPhone };
