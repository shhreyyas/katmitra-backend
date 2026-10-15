const SUPPORTED_LANGUAGE_CODES = new Set(["en", "hi", "gu"]);

function tryParseJsonObjectString(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeLanguageCode(raw) {
  if (typeof raw !== "string" || !raw.trim()) return "en";
  const base = raw
    .trim()
    .toLowerCase()
    .split(",")[0]
    .split(";")[0]
    .replace("_", "-");
  const primary = base.split("-")[0];
  return SUPPORTED_LANGUAGE_CODES.has(primary) ? primary : "en";
}

function getRequestedLanguage(req) {
  return normalizeLanguageCode(
    req.headers["x-language"] || req.headers["accept-language"] || "en",
  );
}

function normalizeLocalizedName(input) {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const parsedObject = tryParseJsonObjectString(trimmed);
    if (parsedObject) {
      return normalizeLocalizedName(parsedObject);
    }
    return { en: trimmed };
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const out = {};
  for (const [rawLang, rawValue] of Object.entries(input)) {
    const lang = normalizeLanguageCode(rawLang);
    if (!SUPPORTED_LANGUAGE_CODES.has(lang)) continue;
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (value) out[lang] = value;
  }

  const keys = Object.keys(out);
  if (keys.length === 0) return null;
  if (!out.en) out.en = out[keys[0]];
  return out;
}

/** Language of a typed name, from its script: Gujarati → gu, Devanagari → hi, else en. */
function detectNameLanguage(text) {
  const s = String(text ?? "");
  if (/[\u0A80-\u0AFF]/.test(s)) return "gu";
  if (/[\u0900-\u097F]/.test(s)) return "hi";
  return "en";
}

/**
 * Names caterers type for their own menu and supply items. The app sends one typed
 * name, either as a plain string or copied into every language, so it is stored only
 * under the language it is written in instead of being filed as English. A name that
 * really differs per language is kept as given. With `current`, the typed name replaces
 * only its own language and the item's other translations are kept.
 */
function normalizeTypedItemName(input, current = null) {
  const normalized = normalizeLocalizedName(input);
  if (!normalized) return null;
  const typed =
    typeof input === "string" && !tryParseJsonObjectString(input.trim())
      ? input.trim()
      : null;
  const values = [...new Set(Object.values(input && typeof input === "object" ? input : normalized)
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean))];
  const single = typed ?? (values.length === 1 ? values[0] : null);
  if (!single) return normalized;
  const lang = detectNameLanguage(single);
  const base =
    current && typeof current === "object" && !Array.isArray(current) ? { ...current } : {};
  base[lang] = single;
  return base;
}

function resolveLocalizedName(nameValue, language) {
  function resolveStringValue(raw) {
    if (typeof raw !== "string") return "";
    const trimmed = raw.trim();
    if (!trimmed) return "";
    const parsedObject = tryParseJsonObjectString(trimmed);
    if (parsedObject) {
      return resolveLocalizedName(parsedObject, language);
    }
    return trimmed;
  }

  if (typeof nameValue === "string") {
    return resolveStringValue(nameValue);
  }
  if (!nameValue || typeof nameValue !== "object" || Array.isArray(nameValue)) {
    return "";
  }

  const requestedValue = resolveStringValue(nameValue[language]);
  if (requestedValue) {
    return requestedValue;
  }

  const englishValue = resolveStringValue(nameValue.en);
  if (englishValue) {
    return englishValue;
  }

  for (const value of Object.values(nameValue)) {
    const fallback = resolveStringValue(value);
    if (fallback) return fallback;
  }
  return "";
}

module.exports = {
  SUPPORTED_LANGUAGE_CODES,
  normalizeLanguageCode,
  getRequestedLanguage,
  normalizeLocalizedName,
  normalizeTypedItemName,
  detectNameLanguage,
  resolveLocalizedName,
};
