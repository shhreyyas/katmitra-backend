const LEGACY_UNSET_PDF_PREFIX = "KAT-2024";

function deriveDefaultPdfPrefix(businessName, year = new Date().getFullYear()) {
  const letters = String(businessName ?? "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 3);
  const prefix = letters.length >= 2 ? letters : "KAT";
  return `${prefix}${year}`;
}

function isUnsetPdfPrefix(value) {
  const trimmed = String(value ?? "").trim();
  return !trimmed || trimmed === LEGACY_UNSET_PDF_PREFIX;
}

function resolvePdfPrefix(pdfPrefix, businessName) {
  const trimmed = String(pdfPrefix ?? "").trim();
  if (trimmed && !isUnsetPdfPrefix(trimmed)) {
    return trimmed;
  }
  return deriveDefaultPdfPrefix(businessName);
}

function businessNameFromOverrides(overrides) {
  const details = overrides.business_details;
  if (!Array.isArray(details) || details.length === 0) return null;
  return details[0]?.business_name ?? null;
}

function validatePdfPrefix(value) {
  const trimmed = String(value ?? "").trim();
  if (trimmed.length < 2 || trimmed.length > 24) return false;
  return /^[A-Za-z0-9\-_]+$/.test(trimmed);
}

function formatUserResponse(user, overrides = {}) {
  const businessName = businessNameFromOverrides(overrides);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    contact: user.phoneNumber ?? null,
    profile_pic: user.profileImageUrl ?? null,
    pdf_prefix: resolvePdfPrefix(user.pdfPrefix, businessName),
    status: user.isVerified ? 1 : 0,
    notification_status: user.notificationStatus,
    user_verified_at: user.userVerifiedAt?.toISOString() ?? null,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
    deleted_at: user.deletedAt ?? null,
    role: user.role,
    language: user.language,
    ...overrides,
  };
}

module.exports = {
  LEGACY_UNSET_PDF_PREFIX,
  deriveDefaultPdfPrefix,
  isUnsetPdfPrefix,
  resolvePdfPrefix,
  validatePdfPrefix,
  formatUserResponse,
};
