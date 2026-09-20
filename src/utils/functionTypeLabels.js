const { normalizeLanguageCode } = require("./localization");

/**
 * Mirrors katmitra-app/src/constants/bookingFunctionTypes.ts's
 * FUNCTION_TYPE_OPTIONS + language JSONs — kept in sync manually, since the
 * app owns the canonical list/labels and the backend only needs them to
 * localize the `function_type` slug it already stores/returns.
 */
const FUNCTION_TYPE_LABELS = {
  weddingReception: { en: "Wedding Reception", hi: "शादी का रिसेप्शन", gu: "લગ્ન સમારંભ" },
  corporateLunch: { en: "Corporate Lunch", hi: "कॉर्पोरेट लंच", gu: "કોર્પોરેટ લંચ" },
  birthdayParty: { en: "Birthday Party", hi: "जन्मदिन पार्टी", gu: "જન્મદિવસ પાર્ટી" },
  anniversaryDinner: { en: "Anniversary Dinner", hi: "वर्षगांठ डिनर", gu: "વાર્ષિકી ડિનર" },
  galaDinner: { en: "Gala Dinner", hi: "गाला डिनर", gu: "ગાલા ડિનર" },
  cocktailParty: { en: "Cocktail Party", hi: "कॉकटेल पार्टी", gu: "કોકટેલ પાર્ટી" },
  babyShower: { en: "Baby Shower", hi: "बेबी शॉवर", gu: "બેબી શાવર" },
  graduationParty: { en: "Graduation Party", hi: "ग्रेजुएशन पार्टी", gu: "ગ્રેજ્યુએશન પાર્ટી" },
  farewellParty: { en: "Farewell Party", hi: "विदाई पार्टी", gu: "વિદાય પાર્ટી" },
  productLaunch: { en: "Product Launch", hi: "प्रोडक्ट लॉन्च", gu: "પ્રોડક્ટ લોન્ચ" },
  teamBuildingEvent: { en: "Team Building Event", hi: "टीम बिल्डिंग इवेंट", gu: "ટીમ બિલ્ડિંગ કાર્યક્રમ" },
  conferenceCatering: { en: "Conference Catering", hi: "कॉन्फ्रेंस कैटरिंग", gu: "કોન્ફરન્સ કેટરિંગ" },
  funeralReception: { en: "Funeral Reception", hi: "अंतिम संस्कार समारोह", gu: "અંતિમ વિદાય સમારંભ" },
  religiousCeremony: { en: "Religious Ceremony", hi: "धार्मिक समारोह", gu: "ધાર્મિક સમારંભ" },
  other: { en: "Other", hi: "अन्य", gu: "અન્ય" },
};

// Old/free-form slugs written before the preset-key list existed.
const FUNCTION_TYPE_LEGACY_ALIASES = {
  corporate: "corporateLunch",
  wedding: "weddingReception",
  birthday: "birthdayParty",
};

function normLetters(s) {
  return String(s).toLowerCase().replace(/[^a-z]/g, "");
}

function resolveFunctionTypeKey(rawSlug) {
  const v = String(rawSlug || "").trim();
  if (!v) return null;
  if (FUNCTION_TYPE_LABELS[v]) return v;
  const legacy = FUNCTION_TYPE_LEGACY_ALIASES[v.toLowerCase()];
  if (legacy) return legacy;
  const nv = normLetters(v);
  const fuzzy = Object.keys(FUNCTION_TYPE_LABELS).find((k) => normLetters(k) === nv);
  return fuzzy ?? null;
}

/**
 * Resolves a stored `functionType` slug to a display label in the
 * requested language. Unknown slugs are treated as free-text custom values
 * (the app lets callers save arbitrary text via the "Other" option) and are
 * returned unchanged rather than translated.
 */
function resolveFunctionTypeLabel(rawSlug, language) {
  const v = String(rawSlug || "").trim();
  if (!v) return null;
  const key = resolveFunctionTypeKey(v);
  if (!key) return v;
  const lang = normalizeLanguageCode(language);
  const labels = FUNCTION_TYPE_LABELS[key];
  return labels[lang] || labels.en;
}

module.exports = { resolveFunctionTypeLabel };
