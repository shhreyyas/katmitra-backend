const { SUPPORTED_LANGUAGE_CODES } = require("./localization");

function resolveLang(lang) {
  return SUPPORTED_LANGUAGE_CODES.has(lang) ? lang : "en";
}

// "for {name}" style suffix used by several reminder bodies.
function buildForSuffix(lang, name) {
  if (!name) return "";
  const table = {
    en: ` for ${name}`,
    hi: ` (${name} के लिए)`,
    gu: ` (${name} માટે)`,
  };
  return table[resolveLang(lang)];
}

// The relative-time phrase used inside the event reminder body.
function buildEventDatePhrase(lang, { reminderType, isTomorrow, timeStr, longDateStr }) {
  if (!timeStr) return "";
  const phrases = {
    en: {
      tomorrow: `Tomorrow at ${timeStr}`,
      "2_HOUR": `In 2 hours at ${timeStr}`,
      "30_MINUTE": `In 30 minutes at ${timeStr}`,
      default: `${longDateStr} at ${timeStr}`,
    },
    hi: {
      tomorrow: `कल ${timeStr} बजे`,
      "2_HOUR": `2 घंटे में, ${timeStr} बजे`,
      "30_MINUTE": `30 मिनट में, ${timeStr} बजे`,
      default: `${longDateStr}, ${timeStr} बजे`,
    },
    gu: {
      tomorrow: `આવતીકાલે ${timeStr} વાગ્યે`,
      "2_HOUR": `2 કલાકમાં, ${timeStr} વાગ્યે`,
      "30_MINUTE": `30 મિનિટમાં, ${timeStr} વાગ્યે`,
      default: `${longDateStr}, ${timeStr} વાગ્યે`,
    },
  };
  const table = phrases[resolveLang(lang)];
  if (reminderType === "24_HOUR" && isTomorrow) return table.tomorrow;
  if (reminderType === "2_HOUR") return table["2_HOUR"];
  if (reminderType === "30_MINUTE") return table["30_MINUTE"];
  return table.default;
}

const notificationTranslations = {
  eventReminder: {
    en: ({ eventType, forSuffix, datePhrase, venue, guests }) => {
      const lines = [`${eventType}${forSuffix}`];
      if (datePhrase) lines.push(datePhrase);
      if (venue) lines.push(`Venue: ${venue}`);
      if (guests) lines.push(`Guests: ${guests}`);
      return { title: "📅 Event Reminder", body: lines.join("\n") };
    },
    hi: ({ eventType, forSuffix, datePhrase, venue, guests }) => {
      const lines = [`${eventType}${forSuffix}`];
      if (datePhrase) lines.push(datePhrase);
      if (venue) lines.push(`स्थान: ${venue}`);
      if (guests) lines.push(`मेहमान: ${guests}`);
      return { title: "📅 इवेंट रिमाइंडर", body: lines.join("\n") };
    },
    gu: ({ eventType, forSuffix, datePhrase, venue, guests }) => {
      const lines = [`${eventType}${forSuffix}`];
      if (datePhrase) lines.push(datePhrase);
      if (venue) lines.push(`સ્થળ: ${venue}`);
      if (guests) lines.push(`મહેમાનો: ${guests}`);
      return { title: "📅 ઇવેન્ટ રિમાઇન્ડર", body: lines.join("\n") };
    },
  },

  bookingNoEvents: {
    en: ({ forSuffix }) => ({
      title: "Don't forget your events! 📅",
      body: `You created a booking${forSuffix} but haven't added any events yet. Tap to add events now.`,
    }),
    hi: ({ forSuffix }) => ({
      title: "अपने इवेंट्स न भूलें! 📅",
      body: `आपने एक बुकिंग बनाई${forSuffix} लेकिन अभी तक कोई इवेंट नहीं जोड़ा है। अभी इवेंट जोड़ने के लिए टैप करें।`,
    }),
    gu: ({ forSuffix }) => ({
      title: "તમારા ઇવેન્ટ્સ ભૂલશો નહીં! 📅",
      body: `તમે એક બુકિંગ બનાવી${forSuffix} પણ હજુ સુધી કોઈ ઇવેન્ટ ઉમેર્યો નથી. હમણાં ઇવેન્ટ ઉમેરવા માટે ટેપ કરો.`,
    }),
  },

  eventNoMenu: {
    en: ({ forSuffix }) => ({
      title: "Don't forget the menu! 🍽️",
      body: `You created an event${forSuffix} but haven't selected a menu yet. Tap to pick a menu now.`,
    }),
    hi: ({ forSuffix }) => ({
      title: "मेन्यू न भूलें! 🍽️",
      body: `आपने एक इवेंट बनाया${forSuffix} लेकिन अभी तक मेन्यू नहीं चुना है। अभी मेन्यू चुनने के लिए टैप करें।`,
    }),
    gu: ({ forSuffix }) => ({
      title: "મેનુ ભૂલશો નહીં! 🍽️",
      body: `તમે એક ઇવેન્ટ બનાવ્યો${forSuffix} પણ હજુ સુધી મેનુ પસંદ કર્યું નથી. હમણાં મેનુ પસંદ કરવા માટે ટેપ કરો.`,
    }),
  },

  paymentPending: {
    en: ({ forSuffix }) => ({
      title: "Payment pending! 💳",
      body: `Payment is still remaining for the booking${forSuffix}. Please collect it at your earliest convenience.`,
    }),
    hi: ({ forSuffix }) => ({
      title: "भुगतान लंबित है! 💳",
      body: `बुकिंग${forSuffix} के लिए भुगतान अभी भी बाकी है। कृपया जल्द से जल्द इसे प्राप्त करें।`,
    }),
    gu: ({ forSuffix }) => ({
      title: "ચુકવણી બાકી છે! 💳",
      body: `બુકિંગ${forSuffix} માટે ચુકવણી હજુ બાકી છે. કૃપા કરીને શક્ય તેટલી વહેલી તકે તે મેળવો.`,
    }),
  },

  quotationUpcoming: {
    en: ({ clientName }) => ({
      title: "Quotation event coming up! 📋",
      body: `Your quotation for ${clientName} has an event in 3 days. Make sure everything is confirmed.`,
    }),
    hi: ({ clientName }) => ({
      title: "कोटेशन इवेंट नजदीक है! 📋",
      body: `${clientName} के लिए आपके कोटेशन का इवेंट 3 दिनों में है। कृपया सुनिश्चित करें कि सब कुछ कन्फर्म है।`,
    }),
    gu: ({ clientName }) => ({
      title: "ક્વોટેશન ઇવેન્ટ નજીક છે! 📋",
      body: `${clientName} માટેના તમારા ક્વોટેશનનો ઇવેન્ટ 3 દિવસમાં છે. કૃપા કરીને ખાતરી કરો કે બધું કન્ફર્મ છે.`,
    }),
  },

  quotationPassed: {
    en: ({ clientName }) => ({
      title: "Quotation event has passed 📋",
      body: `The event date for your quotation for ${clientName} has passed. Please update its status.`,
    }),
    hi: ({ clientName }) => ({
      title: "कोटेशन इवेंट बीत चुका है 📋",
      body: `${clientName} के लिए आपके कोटेशन की इवेंट तिथि बीत चुकी है। कृपया इसकी स्थिति अपडेट करें।`,
    }),
    gu: ({ clientName }) => ({
      title: "ક્વોટેશન ઇવેન્ટ પસાર થઈ ગયો છે 📋",
      body: `${clientName} માટેના તમારા ક્વોટેશનની ઇવેન્ટ તારીખ પસાર થઈ ગઈ છે. કૃપા કરીને તેની સ્થિતિ અપડેટ કરો.`,
    }),
  },

  draftUpcoming: {
    en: ({ forSuffix }) => ({
      title: "Draft booking event coming up! 📝",
      body: `You have a draft booking${forSuffix} with an event in 3 days. Confirm it now.`,
    }),
    hi: ({ forSuffix }) => ({
      title: "ड्राफ्ट बुकिंग इवेंट नजदीक है! 📝",
      body: `आपके पास एक ड्राफ्ट बुकिंग है${forSuffix} जिसका इवेंट 3 दिनों में है। अभी इसे कन्फर्म करें।`,
    }),
    gu: ({ forSuffix }) => ({
      title: "ડ્રાફ્ટ બુકિંગ ઇવેન્ટ નજીક છે! 📝",
      body: `તમારી પાસે એક ડ્રાફ્ટ બુકિંગ છે${forSuffix} જેનો ઇવેન્ટ 3 દિવસમાં છે. હમણાં તેને કન્ફર્મ કરો.`,
    }),
  },

  draftPassed: {
    en: ({ forSuffix }) => ({
      title: "Draft booking event has passed 📝",
      body: `The event date for your draft booking${forSuffix} has passed. Please review or close it.`,
    }),
    hi: ({ forSuffix }) => ({
      title: "ड्राफ्ट बुकिंग इवेंट बीत चुका है 📝",
      body: `आपकी ड्राफ्ट बुकिंग${forSuffix} की इवेंट तिथि बीत चुकी है। कृपया इसे रिव्यू करें या बंद करें।`,
    }),
    gu: ({ forSuffix }) => ({
      title: "ડ્રાફ્ટ બુકિંગ ઇવેન્ટ પસાર થઈ ગયો છે 📝",
      body: `તમારી ડ્રાફ્ટ બુકિંગ${forSuffix}ની ઇવેન્ટ તારીખ પસાર થઈ ગઈ છે. કૃપા કરીને તેની સમીક્ષા કરો અથવા બંધ કરો.`,
    }),
  },

  onboarding: {
    en: () => ({
      title: "Complete your setup 🏪",
      body: "You haven't registered your catering business yet. Set it up now to start managing bookings.",
    }),
    hi: () => ({
      title: "अपना सेटअप पूरा करें 🏪",
      body: "आपने अभी तक अपना केटरिंग बिजनेस रजिस्टर नहीं किया है। बुकिंग मैनेज करना शुरू करने के लिए अभी इसे सेट करें।",
    }),
    gu: () => ({
      title: "તમારું સેટઅપ પૂર્ણ કરો 🏪",
      body: "તમે હજુ સુધી તમારો કેટરિંગ બિઝનેસ રજિસ્ટર કર્યો નથી. બુકિંગ મેનેજ કરવાનું શરૂ કરવા માટે હમણાં તેને સેટ કરો.",
    }),
  },

  welcome: {
    en: () => ({
      title: "Business created! 🎉",
      body: "You're all set. Create your first booking and start managing events.",
    }),
    hi: () => ({
      title: "बिज़नेस बन गया! 🎉",
      body: "आप तैयार हैं। अपनी पहली बुकिंग बनाएं और इवेंट्स मैनेज करना शुरू करें।",
    }),
    gu: () => ({
      title: "બિઝનેસ બની ગયો! 🎉",
      body: "તમે તૈયાર છો. તમારી પહેલી બુકિંગ બનાવો અને ઇવેન્ટ્સ મેનેજ કરવાનું શરૂ કરો.",
    }),
  },
};

function getNotificationContent(messageId, lang, params = {}) {
  const table = notificationTranslations[messageId];
  if (!table) {
    throw new Error(`Unknown notification message id: ${messageId}`);
  }
  const build = table[resolveLang(lang)] || table.en;
  return build(params);
}

module.exports = {
  notificationTranslations,
  getNotificationContent,
  buildForSuffix,
  buildEventDatePhrase,
};
