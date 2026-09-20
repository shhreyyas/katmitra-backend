/**
 * Small {en, hi, gu} dictionary + lookup for user-facing API response
 * strings, mirroring the translation-table convention already used in
 * notificationTranslations.js. Response bodies are English-only everywhere
 * else in this backend (only data fields like names go through
 * localization.js) — this covers the messages a client currently surfaces
 * directly to the user; add entries here as more get localized.
 */
const MESSAGES = {
  "common.serverError": {
    en: "Server error",
    hi: "सर्वर त्रुटि",
    gu: "સર્વર ભૂલ",
  },
  "common.ok": {
    en: "OK",
    hi: "ठीक है",
    gu: "બરાબર",
  },
  "common.invalidRequest": {
    en: "Invalid request",
    hi: "अमान्य अनुरोध",
    gu: "અમાન્ય વિનંતી",
  },
  "common.businessRequired": {
    en: "Business required",
    hi: "बिज़नेस आवश्यक है",
    gu: "બિઝનેસ જરૂરી છે",
  },
  "booking.notFound": {
    en: "Booking not found",
    hi: "बुकिंग नहीं मिली",
    gu: "બુકિંગ મળ્યું નથી",
  },
  "bookingEvent.notFound": {
    en: "Event not found",
    hi: "इवेंट नहीं मिला",
    gu: "ઇવેન્ટ મળ્યો નથી",
  },
  "category.nameRequired": {
    en: "Category name is required",
    hi: "श्रेणी का नाम आवश्यक है",
    gu: "કેટેગરીનું નામ જરૂરી છે",
  },
  "category.duplicate": {
    en: "This category already exists",
    hi: "यह श्रेणी पहले से मौजूद है",
    gu: "આ કેટેગરી પહેલેથી અસ્તિત્વમાં છે",
  },
  "category.duplicateDetail": {
    en: "Choose a different name, or pick this category from the list.",
    hi: "कोई दूसरा नाम चुनें, या सूची में से यह श्रेणी चुनें।",
    gu: "અલગ નામ પસંદ કરો, અથવા યાદીમાંથી આ કેટેગરી પસંદ કરો.",
  },
  "category.slugConflict": {
    en: "Category name or slug already exists",
    hi: "श्रेणी का नाम या स्लग पहले से मौजूद है",
    gu: "કેટેગરીનું નામ અથવા સ્લગ પહેલેથી અસ્તિત્વમાં છે",
  },
  "category.serverError": {
    en: "Server error",
    hi: "सर्वर त्रुटि",
    gu: "સર્વર ભૂલ",
  },
  "category.notFound": {
    en: "Category not found",
    hi: "श्रेणी नहीं मिली",
    gu: "કેટેગરી મળી નથી",
  },
  "category.globalReadOnly": {
    en: "Global categories can't be changed here.",
    hi: "ग्लोबल श्रेणियों को यहां बदला नहीं जा सकता।",
    gu: "ગ્લોબલ કેટેગરીઝ અહીંથી બદલી શકાતી નથી.",
  },
  "category.inUse": {
    en: "This category is used by one or more menu items. Move or delete those items first.",
    hi: "इस श्रेणी का उपयोग एक या अधिक मेनू आइटम में हो रहा है। पहले उन आइटम को हटाएं या दूसरी श्रेणी में ले जाएं।",
    gu: "આ કેટેગરીનો ઉપયોગ એક અથવા વધુ મેનુ આઇટમમાં થાય છે. પહેલા તે આઇટમ દૂર કરો અથવા બીજી કેટેગરીમાં ખસેડો.",
  },
  "supplyItem.duplicate": {
    en: "An item with this name already exists in this category",
    hi: "इस श्रेणी में इस नाम की आइटम पहले से मौजूद है",
    gu: "આ કેટેગરીમાં આ નામની આઇટમ પહેલેથી અસ્તિત્વમાં છે",
  },
  "supplyItem.duplicateDetail": {
    en: "Choose a different name, or pick the existing item from the list.",
    hi: "कोई दूसरा नाम चुनें, या सूची में से मौजूदा आइटम चुनें।",
    gu: "અલગ નામ પસંદ કરો, અથવા યાદીમાંથી હાલની આઇટમ પસંદ કરો.",
  },
  "menuItem.inUse": {
    en: "This item is used in a booking, quotation, or dish. Deactivate it instead.",
    hi: "यह आइटम किसी बुकिंग, कोटेशन या डिश में उपयोग हो रहा है। इसके बजाय इसे निष्क्रिय करें।",
    gu: "આ આઇટમ કોઈ બુકિંગ, ક્વોટેશન અથવા ડિશમાં વપરાયેલ છે. તેને બદલે નિષ્ક્રિય કરો.",
  },
};

/** Looks up `key` in the requester's language, falling back to English. */
function apiMessage(key, language) {
  const entry = MESSAGES[key];
  if (!entry) return key;
  return entry[language] || entry.en || key;
}

module.exports = { apiMessage };
