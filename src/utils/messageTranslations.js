/**
 * Hindi / Gujarati text for the plain-English messages controllers pass to
 * successResponse / errorResponse. response.js looks the message up here by its
 * English text, so call sites stay unchanged; anything not listed is sent as-is.
 *
 * Deliberately NOT listed (the mobile app matches these by exact English text):
 * "Business not found", "User not authenticated", "Permission Denied",
 * "Cannot delete the last event. Delete booking instead."
 */
const MESSAGE_TRANSLATIONS = {
  "Discount cannot be more than the booking amount": {
    hi: "छूट बुकिंग की राशि से अधिक नहीं हो सकती",
    gu: "ડિસ્કાઉન્ટ બુકિંગની રકમ કરતાં વધુ ન હોઈ શકે",
  },
  "A dish with this name already exists": {
    hi: "इस नाम की डिश पहले से मौजूद है",
    gu: "આ નામની ડિશ પહેલેથી છે",
  },
  "Add at least one scheduled event before completing this order": {
    hi: "ऑर्डर पूरा करने से पहले कम से कम एक कार्यक्रम जोड़ें",
    gu: "ઓર્ડર પૂર્ણ કરતા પહેલાં ઓછામાં ઓછો એક કાર્યક્રમ ઉમેરો",
  },
  "All language names are required": {
    hi: "नाम आवश्यक है",
    gu: "નામ જરૂરી છે",
  },
  "All notifications marked as read": {
    hi: "सभी सूचनाएँ पढ़ी हुई चिह्नित की गईं",
    gu: "બધી સૂચનાઓ વંચાયેલી તરીકે ચિહ્નિત થઈ",
  },
  "Already completed": {
    hi: "पहले ही पूर्ण हो चुका है",
    gu: "પહેલેથી પૂર્ણ થયેલ છે",
  },
  "Already converted": {
    hi: "पहले ही बदला जा चुका है",
    gu: "પહેલેથી રૂપાંતરિત થયેલ છે",
  },
  "Amount exceeds remaining balance": {
    hi: "राशि बकाया रकम से अधिक है",
    gu: "રકમ બાકી રકમ કરતાં વધુ છે",
  },
  "Amount must be positive": {
    hi: "राशि शून्य से अधिक होनी चाहिए",
    gu: "રકમ શૂન્યથી વધુ હોવી જોઈએ",
  },
  "At least one item is required": {
    hi: "कम से कम एक आइटम आवश्यक है",
    gu: "ઓછામાં ઓછી એક આઇટમ જરૂરી છે",
  },
  "At least one non-empty name is required": {
    hi: "कम से कम एक नाम आवश्यक है",
    gu: "ઓછામાં ઓછું એક નામ જરૂરી છે",
  },
  "Booking cancelled": {
    hi: "बुकिंग रद्द की गई",
    gu: "બુકિંગ રદ થયું",
  },
  "Booking confirmed": {
    hi: "बुकिंग की पुष्टि हुई",
    gu: "બુકિંગ કન્ફર્મ થયું",
  },
  "Booking details can only be updated more than 12 hours before the event.": {
    hi: "बुकिंग विवरण कार्यक्रम से 12 घंटे से अधिक पहले ही बदले जा सकते हैं।",
    gu: "બુકિંગની વિગતો કાર્યક્રમના 12 કલાકથી વધુ પહેલાં જ બદલી શકાય છે.",
  },
  "Booking is already cancelled": {
    hi: "बुकिंग पहले ही रद्द है",
    gu: "બુકિંગ પહેલેથી રદ છે",
  },
  "Booking is not a draft": {
    hi: "यह बुकिंग ड्राफ्ट नहीं है",
    gu: "આ બુકિંગ ડ્રાફ્ટ નથી",
  },
  "Booking not found": {
    hi: "बुकिंग नहीं मिली",
    gu: "બુકિંગ મળ્યું નથી",
  },
  "Booking updated": {
    hi: "बुकिंग अपडेट हुई",
    gu: "બુકિંગ અપડેટ થયું",
  },
  "Business already registered for this user": {
    hi: "इस उपयोगकर्ता का बिज़नेस पहले से पंजीकृत है",
    gu: "આ વપરાશકર્તાનો બિઝનેસ પહેલેથી નોંધાયેલ છે",
  },
  "Business deleted successfully": {
    hi: "बिज़नेस हटा दिया गया",
    gu: "બિઝનેસ કાઢી નાખવામાં આવ્યો",
  },
  "Business name cannot be empty": {
    hi: "बिज़नेस का नाम खाली नहीं हो सकता",
    gu: "બિઝનેસનું નામ ખાલી ન હોઈ શકે",
  },
  "Business profile updated successfully": {
    hi: "बिज़नेस प्रोफ़ाइल अपडेट हुई",
    gu: "બિઝનેસ પ્રોફાઇલ અપડેટ થઈ",
  },
  "Business registered successfully": {
    hi: "बिज़नेस पंजीकृत हुआ",
    gu: "બિઝનેસ નોંધાયો",
  },
  "Business required": {
    hi: "बिज़नेस आवश्यक है",
    gu: "બિઝનેસ જરૂરી છે",
  },
  "Cancelled booking cannot be updated": {
    hi: "रद्द की गई बुकिंग बदली नहीं जा सकती",
    gu: "રદ થયેલ બુકિંગ બદલી શકાતું નથી",
  },
  "Cancelled booking cannot be used": {
    hi: "रद्द की गई बुकिंग उपयोग नहीं की जा सकती",
    gu: "રદ થયેલ બુકિંગ વાપરી શકાતું નથી",
  },
  "Cannot add events to a confirmed booking from this screen.": {
    hi: "इस स्क्रीन से कन्फर्म बुकिंग में कार्यक्रम नहीं जोड़े जा सकते।",
    gu: "આ સ્ક્રીન પરથી કન્ફર્મ બુકિંગમાં કાર્યક્રમ ઉમેરી શકાતા નથી.",
  },
  "Cannot delete category with supply items": {
    hi: "जिस श्रेणी में सामग्री है उसे हटाया नहीं जा सकता",
    gu: "જે કેટેગરીમાં વસ્તુઓ છે તે કાઢી શકાતી નથી",
  },
  "Catalogue items cannot be deleted": {
    hi: "कैटलॉग की वस्तुएँ हटाई नहीं जा सकतीं",
    gu: "કેટલોગની વસ્તુઓ કાઢી શકાતી નથી",
  },
  "Catalogue items cannot be edited": {
    hi: "कैटलॉग की वस्तुएँ बदली नहीं जा सकतीं",
    gu: "કેટલોગની વસ્તુઓ બદલી શકાતી નથી",
  },
  "Category created successfully": {
    hi: "श्रेणी बनाई गई",
    gu: "કેટેગરી બનાવવામાં આવી",
  },
  "Category deleted successfully": {
    hi: "श्रेणी हटाई गई",
    gu: "કેટેગરી કાઢી નાખવામાં આવી",
  },
  "Category name or slug already exists": {
    hi: "यह श्रेणी पहले से मौजूद है",
    gu: "આ કેટેગરી પહેલેથી છે",
  },
  "Category not found": {
    hi: "श्रेणी नहीं मिली",
    gu: "કેટેગરી મળી નથી",
  },
  "Category slug already exists": {
    hi: "यह श्रेणी पहले से मौजूद है",
    gu: "આ કેટેગરી પહેલેથી છે",
  },
  "Category updated successfully": {
    hi: "श्रेणी अपडेट हुई",
    gu: "કેટેગરી અપડેટ થઈ",
  },
  "Catering business name is required": {
    hi: "कैटरिंग बिज़नेस का नाम आवश्यक है",
    gu: "કેટરિંગ બિઝનેસનું નામ જરૂરી છે",
  },
  "Catering business name must be at least 2 characters": {
    hi: "कैटरिंग बिज़नेस का नाम कम से कम 2 अक्षरों का होना चाहिए",
    gu: "કેટરિંગ બિઝનેસનું નામ ઓછામાં ઓછા 2 અક્ષરનું હોવું જોઈએ",
  },
  "Completed booking cannot be updated": {
    hi: "पूर्ण हो चुकी बुकिंग बदली नहीं जा सकती",
    gu: "પૂર્ણ થયેલ બુકિંગ બદલી શકાતું નથી",
  },
  "Completed orders cannot be cancelled": {
    hi: "पूर्ण हो चुके ऑर्डर रद्द नहीं किए जा सकते",
    gu: "પૂર્ણ થયેલ ઓર્ડર રદ કરી શકાતા નથી",
  },
  "Confirmed booking is locked for customer updates.": {
    hi: "कन्फर्म बुकिंग में ग्राहक विवरण नहीं बदले जा सकते।",
    gu: "કન્ફર્મ બુકિંગમાં ગ્રાહકની વિગતો બદલી શકાતી નથી.",
  },
  "Confirmed booking is locked for event/menu updates.": {
    hi: "कन्फर्म बुकिंग में कार्यक्रम/मेनू नहीं बदले जा सकते।",
    gu: "કન્ફર્મ બુકિંગમાં કાર્યક્રમ/મેનુ બદલી શકાતા નથી.",
  },
  "Confirmed booking is locked for menu updates.": {
    hi: "कन्फर्म बुकिंग में मेनू नहीं बदला जा सकता।",
    gu: "કન્ફર્મ બુકિંગમાં મેનુ બદલી શકાતું નથી.",
  },
  "Dish created": {
    hi: "डिश बनाई गई",
    gu: "ડિશ બનાવવામાં આવી",
  },
  "Dish deleted": {
    hi: "डिश हटाई गई",
    gu: "ડિશ કાઢી નાખવામાં આવી",
  },
  "Dish name required": {
    hi: "डिश का नाम आवश्यक है",
    gu: "ડિશનું નામ જરૂરી છે",
  },
  "Dish not found": {
    hi: "डिश नहीं मिली",
    gu: "ડિશ મળી નથી",
  },
  "Dish updated": {
    hi: "डिश अपडेट हुई",
    gu: "ડિશ અપડેટ થઈ",
  },
  "Dishes deleted": {
    hi: "डिशें हटाई गईं",
    gu: "ડિશો કાઢી નાખવામાં આવી",
  },
  "Draft created": {
    hi: "ड्राफ्ट बनाया गया",
    gu: "ડ્રાફ્ટ બનાવવામાં આવ્યો",
  },
  "Email already registered.": {
    hi: "यह ईमेल पहले से पंजीकृत है।",
    gu: "આ ઇમેઇલ પહેલેથી નોંધાયેલ છે.",
  },
  "Email or password is incorrect": {
    hi: "ईमेल या पासवर्ड गलत है",
    gu: "ઇમેઇલ અથવા પાસવર્ડ ખોટો છે",
  },
  "Enter a valid 10-digit phone number": {
    hi: "मान्य 10 अंकों का फ़ोन नंबर दर्ज करें",
    gu: "માન્ય 10 અંકનો ફોન નંબર દાખલ કરો",
  },
  "Event created": {
    hi: "कार्यक्रम बनाया गया",
    gu: "કાર્યક્રમ બનાવવામાં આવ્યો",
  },
  "Event deleted": {
    hi: "कार्यक्रम हटाया गया",
    gu: "કાર્યક્રમ કાઢી નાખવામાં આવ્યો",
  },
  "Event menu item replaced": {
    hi: "कार्यक्रम का मेनू आइटम बदला गया",
    gu: "કાર્યક્રમની મેનુ આઇટમ બદલાઈ",
  },
  "Event not found": {
    hi: "कार्यक्रम नहीं मिला",
    gu: "કાર્યક્રમ મળ્યો નથી",
  },
  "Event supply item deleted": {
    hi: "कार्यक्रम की सामग्री हटाई गई",
    gu: "કાર્યક્રમની વસ્તુ કાઢી નાખવામાં આવી",
  },
  "Event supply item updated": {
    hi: "कार्यक्रम की सामग्री अपडेट हुई",
    gu: "કાર્યક્રમની વસ્તુ અપડેટ થઈ",
  },
  "Event supply items updated": {
    hi: "कार्यक्रम की सामग्री अपडेट हुई",
    gu: "કાર્યક્રમની વસ્તુઓ અપડેટ થઈ",
  },
  "Event updated": {
    hi: "कार्यक्रम अपडेट हुआ",
    gu: "કાર્યક્રમ અપડેટ થયો",
  },
  "Extra service created": {
    hi: "सेवा जोड़ी गई",
    gu: "સેવા ઉમેરાઈ",
  },
  "Extra service deleted": {
    hi: "सेवा हटाई गई",
    gu: "સેવા કાઢી નાખવામાં આવી",
  },
  "Extra service not found": {
    hi: "सेवा नहीं मिली",
    gu: "સેવા મળી નથી",
  },
  "Extra service updated": {
    hi: "सेवा अपडेट हुई",
    gu: "સેવા અપડેટ થઈ",
  },
  "Extra services updated": {
    hi: "सेवाएँ अपडेट हुईं",
    gu: "સેવાઓ અપડેટ થઈ",
  },
  "GST number is invalid": {
    hi: "GST नंबर अमान्य है",
    gu: "GST નંબર અમાન્ય છે",
  },
  "Image uploaded successfully": {
    hi: "छवि अपलोड हुई",
    gu: "છબી અપલોડ થઈ",
  },
  "Invalid email address": {
    hi: "अमान्य ईमेल पता",
    gu: "અમાન્ય ઇમેઇલ સરનામું",
  },
  "Invalid payment method": {
    hi: "अमान्य भुगतान विधि",
    gu: "અમાન્ય ચુકવણી પદ્ધતિ",
  },
  "Invalid request": {
    hi: "अमान्य अनुरोध",
    gu: "અમાન્ય વિનંતી",
  },
  "Invalid request fields": {
    hi: "अमान्य जानकारी",
    gu: "અમાન્ય માહિતી",
  },
  "List has no items": {
    hi: "सूची में कोई आइटम नहीं है",
    gu: "યાદીમાં કોઈ આઇટમ નથી",
  },
  "List name is required": {
    hi: "सूची का नाम आवश्यक है",
    gu: "યાદીનું નામ જરૂરી છે",
  },
  "List not found": {
    hi: "सूची नहीं मिली",
    gu: "યાદી મળી નથી",
  },
  "Logged out successfully": {
    hi: "लॉगआउट हो गया",
    gu: "લૉગઆઉટ થયું",
  },
  "Marked as read": {
    hi: "पढ़ा हुआ चिह्नित किया गया",
    gu: "વંચાયેલ તરીકે ચિહ્નિત થયું",
  },
  "Menu can only be edited more than 12 hours before the event.": {
    hi: "मेनू कार्यक्रम से 12 घंटे से अधिक पहले ही बदला जा सकता है।",
    gu: "મેનુ કાર્યક્રમના 12 કલાકથી વધુ પહેલાં જ બદલી શકાય છે.",
  },
  "Menu item created successfully": {
    hi: "मेनू आइटम बनाया गया",
    gu: "મેનુ આઇટમ બનાવવામાં આવી",
  },
  "Menu item deleted successfully": {
    hi: "मेनू आइटम हटाया गया",
    gu: "મેનુ આઇટમ કાઢી નાખવામાં આવી",
  },
  "Menu item not found": {
    hi: "मेनू आइटम नहीं मिला",
    gu: "મેનુ આઇટમ મળી નથી",
  },
  "Menu item updated successfully": {
    hi: "मेनू आइटम अपडेट हुआ",
    gu: "મેનુ આઇટમ અપડેટ થઈ",
  },
  "Missing or invalid request fields": {
    hi: "जानकारी अधूरी या अमान्य है",
    gu: "માહિતી અધૂરી અથવા અમાન્ય છે",
  },
  "Name is required": {
    hi: "नाम आवश्यक है",
    gu: "નામ જરૂરી છે",
  },
  "Name must be at least 2 characters": {
    hi: "नाम कम से कम 2 अक्षरों का होना चाहिए",
    gu: "નામ ઓછામાં ઓછા 2 અક્ષરનું હોવું જોઈએ",
  },
  "No account found for the given email": {
    hi: "इस ईमेल से कोई खाता नहीं मिला",
    gu: "આ ઇમેઇલ સાથે કોઈ એકાઉન્ટ મળ્યું નથી",
  },
  "No business context. Register a business first.": {
    hi: "पहले अपना बिज़नेस पंजीकृत करें।",
    gu: "પહેલા તમારો બિઝનેસ નોંધાવો.",
  },
  "No fields to update": {
    hi: "अपडेट करने के लिए कुछ नहीं है",
    gu: "અપડેટ કરવા માટે કંઈ નથી",
  },
  "No matching menu item in this event": {
    hi: "इस कार्यक्रम में यह मेनू आइटम नहीं है",
    gu: "આ કાર્યક્રમમાં આ મેનુ આઇટમ નથી",
  },
  "Not found": {
    hi: "नहीं मिला",
    gu: "મળ્યું નથી",
  },
  "Notification not found": {
    hi: "सूचना नहीं मिली",
    gu: "સૂચના મળી નથી",
  },
  "Notification settings updated": {
    hi: "सूचना सेटिंग्स अपडेट हुईं",
    gu: "સૂચના સેટિંગ્સ અપડેટ થઈ",
  },
  "OTP is incorrect or has expired": {
    hi: "OTP गलत है या उसकी समय-सीमा समाप्त हो गई है",
    gu: "OTP ખોટો છે અથવા તેની સમયમર્યાદા પૂરી થઈ ગઈ છે",
  },
  "OTP resent successfully": {
    hi: "OTP फिर से भेजा गया",
    gu: "OTP ફરી મોકલવામાં આવ્યો",
  },
  "OTP sent to email": {
    hi: "OTP ईमेल पर भेजा गया",
    gu: "OTP ઇમેઇલ પર મોકલવામાં આવ્યો",
  },
  "OTP verified": {
    hi: "OTP सत्यापित हुआ",
    gu: "OTP ચકાસાયો",
  },
  "OTP verified successfully": {
    hi: "OTP सत्यापित हुआ",
    gu: "OTP ચકાસાયો",
  },
  "One or more menu items not found": {
    hi: "एक या अधिक मेनू आइटम नहीं मिले",
    gu: "એક અથવા વધુ મેનુ આઇટમ મળી નથી",
  },
  "One or more required fields are missing or malformed": {
    hi: "एक या अधिक आवश्यक जानकारी अधूरी या गलत है",
    gu: "એક અથવા વધુ જરૂરી માહિતી અધૂરી અથવા ખોટી છે",
  },
  "One or more supply items not found": {
    hi: "एक या अधिक सामग्री नहीं मिली",
    gu: "એક અથવા વધુ વસ્તુઓ મળી નથી",
  },
  "Only confirmed bookings can be cancelled": {
    hi: "केवल कन्फर्म बुकिंग ही रद्द की जा सकती है",
    gu: "માત્ર કન્ફર્મ બુકિંગ જ રદ કરી શકાય છે",
  },
  "Only confirmed bookings can be marked complete": {
    hi: "केवल कन्फर्म बुकिंग ही पूर्ण की जा सकती है",
    gu: "માત્ર કન્ફર્મ બુકિંગ જ પૂર્ણ કરી શકાય છે",
  },
  "Only the business owner can delete this business": {
    hi: "केवल बिज़नेस का मालिक ही इसे हटा सकता है",
    gu: "માત્ર બિઝનેસના માલિક જ તેને કાઢી શકે છે",
  },
  "Order completed": {
    hi: "ऑर्डर पूर्ण हुआ",
    gu: "ઓર્ડર પૂર્ણ થયો",
  },
  "Order supply lists are edited from the order": {
    hi: "ऑर्डर की सामग्री सूची ऑर्डर से ही बदली जाती है",
    gu: "ઓર્ડરની સપ્લાય યાદી ઓર્ડરમાંથી જ બદલાય છે",
  },
  "Order supply lists are removed with the order": {
    hi: "ऑर्डर की सामग्री सूची ऑर्डर के साथ ही हटती है",
    gu: "ઓર્ડરની સપ્લાય યાદી ઓર્ડર સાથે જ દૂર થાય છે",
  },
  "PDF prefix must be 2-24 characters and use letters, numbers, - or _": {
    hi: "PDF उपसर्ग 2-24 अक्षरों का हो और उसमें केवल अक्षर, अंक, - या _ हों",
    gu: "PDF ઉપસર્ગ 2-24 અક્ષરનો હોવો જોઈએ અને તેમાં માત્ર અક્ષરો, અંકો, - અથવા _ હોવા જોઈએ",
  },
  "Password must be 8 characters, include 1 uppercase, 1 number and 1 special character": {
    hi: "पासवर्ड कम से कम 8 अक्षरों का हो और उसमें 1 बड़ा अक्षर, 1 अंक और 1 विशेष चिह्न हो",
    gu: "પાસવર્ડ ઓછામાં ઓછા 8 અક્ષરનો હોવો જોઈએ અને તેમાં 1 મોટો અક્ષર, 1 અંક અને 1 વિશેષ ચિહ્ન હોવું જોઈએ",
  },
  "Password reset successfully": {
    hi: "पासवर्ड रीसेट हो गया",
    gu: "પાસવર્ડ રીસેટ થયો",
  },
  "Payment recorded": {
    hi: "भुगतान दर्ज हुआ",
    gu: "ચુકવણી નોંધાઈ",
  },
  "Payments only for confirmed bookings": {
    hi: "भुगतान केवल कन्फर्म बुकिंग के लिए दर्ज हो सकता है",
    gu: "ચુકવણી માત્ર કન્ફર્મ બુકિંગ માટે નોંધી શકાય છે",
  },
  "Phone must be a 10-digit number": {
    hi: "फ़ोन नंबर 10 अंकों का होना चाहिए",
    gu: "ફોન નંબર 10 અંકનો હોવો જોઈએ",
  },
  "Phone number already registered.": {
    hi: "यह फ़ोन नंबर पहले से पंजीकृत है।",
    gu: "આ ફોન નંબર પહેલેથી નોંધાયેલ છે.",
  },
  "Phone number is required": {
    hi: "फ़ोन नंबर आवश्यक है",
    gu: "ફોન નંબર જરૂરી છે",
  },
  "Profile updated successfully": {
    hi: "प्रोफ़ाइल अपडेट हुई",
    gu: "પ્રોફાઇલ અપડેટ થઈ",
  },
  "Quotation converted to booking": {
    hi: "कोटेशन बुकिंग में बदला गया",
    gu: "કોટેશન બુકિંગમાં રૂપાંતરિત થયું",
  },
  "Quotation created": {
    hi: "कोटेशन बनाया गया",
    gu: "કોટેશન બનાવવામાં આવ્યું",
  },
  "Quotation deleted": {
    hi: "कोटेशन हटाया गया",
    gu: "કોટેશન કાઢી નાખવામાં આવ્યું",
  },
  "Quotation not found": {
    hi: "कोटेशन नहीं मिला",
    gu: "કોટેશન મળ્યું નથી",
  },
  "Quotation updated": {
    hi: "कोटेशन अपडेट हुआ",
    gu: "કોટેશન અપડેટ થયું",
  },
  "Recorded payments exceed the new total. Adjust before changing the booking.": {
    hi: "दर्ज भुगतान नई कुल राशि से अधिक हैं। बुकिंग बदलने से पहले इन्हें ठीक करें।",
    gu: "નોંધાયેલ ચુકવણીઓ નવી કુલ રકમ કરતાં વધુ છે. બુકિંગ બદલતા પહેલાં તેને સુધારો.",
  },
  "Select at least one menu item": {
    hi: "कम से कम एक मेनू आइटम चुनें",
    gu: "ઓછામાં ઓછી એક મેનુ આઇટમ પસંદ કરો",
  },
  "Server error": {
    hi: "सर्वर त्रुटि",
    gu: "સર્વર ભૂલ",
  },
  "Service charge % must be between 0 and 100": {
    hi: "सेवा शुल्क % 0 से 100 के बीच होना चाहिए",
    gu: "સેવા ચાર્જ % 0 થી 100 વચ્ચે હોવો જોઈએ",
  },
  "Staff assigned": {
    hi: "स्टाफ़ सौंपा गया",
    gu: "સ્ટાફ સોંપાયો",
  },
  "Staff created": {
    hi: "स्टाफ़ जोड़ा गया",
    gu: "સ્ટાફ ઉમેરાયો",
  },
  "Staff deleted": {
    hi: "स्टाफ़ हटाया गया",
    gu: "સ્ટાફ કાઢી નાખવામાં આવ્યો",
  },
  "Staff not found": {
    hi: "स्टाफ़ नहीं मिला",
    gu: "સ્ટાફ મળ્યો નથી",
  },
  "Staff scheduling conflict": {
    hi: "स्टाफ़ उस समय किसी और कार्यक्रम में है",
    gu: "સ્ટાફ તે સમયે બીજા કાર્યક્રમમાં છે",
  },
  "Staff unassigned": {
    hi: "स्टाफ़ हटाया गया",
    gu: "સ્ટાફ દૂર કરાયો",
  },
  "Staff updated": {
    hi: "स्टाफ़ अपडेट हुआ",
    gu: "સ્ટાફ અપડેટ થયો",
  },
  "Stock tracking for catalogue utensils is not available yet": {
    hi: "कैटलॉग बर्तनों का स्टॉक अभी उपलब्ध नहीं है",
    gu: "કેટલોગ વાસણોનો સ્ટોક હજી ઉપલબ્ધ નથી",
  },
  "Supply category created": {
    hi: "श्रेणी बनाई गई",
    gu: "કેટેગરી બનાવવામાં આવી",
  },
  "Supply category deleted": {
    hi: "श्रेणी हटाई गई",
    gu: "કેટેગરી કાઢી નાખવામાં આવી",
  },
  "Supply category updated": {
    hi: "श्रेणी अपडेट हुई",
    gu: "કેટેગરી અપડેટ થઈ",
  },
  "Supply item created": {
    hi: "वस्तु जोड़ी गई",
    gu: "વસ્તુ ઉમેરાઈ",
  },
  "Supply item deleted": {
    hi: "वस्तु हटाई गई",
    gu: "વસ્તુ કાઢી નાખવામાં આવી",
  },
  "Supply item not found": {
    hi: "वस्तु नहीं मिली",
    gu: "વસ્તુ મળી નથી",
  },
  "Supply item updated": {
    hi: "वस्तु अपडेट हुई",
    gu: "વસ્તુ અપડેટ થઈ",
  },
  "Supply items updated": {
    hi: "वस्तुएँ अपडेट हुईं",
    gu: "વસ્તુઓ અપડેટ થઈ",
  },
  "Supply list assigned to event": {
    hi: "सामग्री सूची कार्यक्रम को सौंपी गई",
    gu: "સપ્લાય યાદી કાર્યક્રમને સોંપાઈ",
  },
  "Supply list deleted": {
    hi: "सामग्री सूची हटाई गई",
    gu: "સપ્લાય યાદી કાઢી નાખવામાં આવી",
  },
  "Supply list saved": {
    hi: "सामग्री सूची सहेजी गई",
    gu: "સપ્લાય યાદી સાચવાઈ",
  },
  "Supply list updated": {
    hi: "सामग्री सूची अपडेट हुई",
    gu: "સપ્લાય યાદી અપડેટ થઈ",
  },
  "Supply unit created": {
    hi: "इकाई जोड़ी गई",
    gu: "એકમ ઉમેરાયો",
  },
  "Supply unit deleted": {
    hi: "इकाई हटाई गई",
    gu: "એકમ કાઢી નાખવામાં આવ્યો",
  },
  "Supply unit not found": {
    hi: "इकाई नहीं मिली",
    gu: "એકમ મળ્યો નથી",
  },
  "Supply unit updated": {
    hi: "इकाई अपडेट हुई",
    gu: "એકમ અપડેટ થયો",
  },
  "Tax % must be between 0 and 100": {
    hi: "टैक्स % 0 से 100 के बीच होना चाहिए",
    gu: "ટેક્સ % 0 થી 100 વચ્ચે હોવો જોઈએ",
  },
  "Terms & Conditions must be under 4000 characters": {
    hi: "नियम और शर्तें 4000 अक्षरों से कम होनी चाहिए",
    gu: "નિયમો અને શરતો 4000 અક્ષરથી ઓછી હોવી જોઈએ",
  },
  "This booking cannot be updated.": {
    hi: "यह बुकिंग बदली नहीं जा सकती।",
    gu: "આ બુકિંગ બદલી શકાતું નથી.",
  },
  "This booking changed on another device. Please refresh before saving.": {
    hi: "यह बुकिंग किसी दूसरे डिवाइस पर बदली गई है। सहेजने से पहले रीफ़्रेश करें।",
    gu: "આ બુકિંગ બીજા ડિવાઇસ પર બદલાયું છે. સાચવતા પહેલાં રિફ્રેશ કરો.",
  },
  "This quotation has expired and can no longer be confirmed. Update the event date and try again.": {
    hi: "यह कोटेशन समाप्त हो चुका है और अब कन्फर्म नहीं हो सकता। कार्यक्रम की तारीख बदलकर फिर प्रयास करें।",
    gu: "આ કોટેશનની મુદત પૂરી થઈ ગઈ છે અને હવે કન્ફર્મ થઈ શકતું નથી. કાર્યક્રમની તારીખ બદલીને ફરી પ્રયાસ કરો.",
  },
  "This quotation's converted booking no longer exists and can't be re-converted automatically.": {
    hi: "इस कोटेशन से बनी बुकिंग अब मौजूद नहीं है और इसे अपने आप दोबारा नहीं बदला जा सकता।",
    gu: "આ કોટેશનમાંથી બનેલું બુકિંગ હવે નથી અને તેને આપમેળે ફરી રૂપાંતરિત કરી શકાતું નથી.",
  },
  "Title is required": {
    hi: "शीर्षक आवश्यक है",
    gu: "શીર્ષક જરૂરી છે",
  },
  "Unit name is required": {
    hi: "इकाई का नाम आवश्यक है",
    gu: "એકમનું નામ જરૂરી છે",
  },
  "Unit slug already exists": {
    hi: "यह इकाई पहले से मौजूद है",
    gu: "આ એકમ પહેલેથી છે",
  },
  "User deleted successfully": {
    hi: "खाता हटा दिया गया",
    gu: "એકાઉન્ટ કાઢી નાખવામાં આવ્યું",
  },
  "User registration failed.": {
    hi: "पंजीकरण विफल रहा।",
    gu: "નોંધણી નિષ્ફળ રહી.",
  },
  "Utensil not found": {
    hi: "बर्तन नहीं मिला",
    gu: "વાસણ મળ્યું નથી",
  },
  "Vendor category is required": {
    hi: "वेंडर की श्रेणी आवश्यक है",
    gu: "વેન્ડરની કેટેગરી જરૂરી છે",
  },
  "Vendor created": {
    hi: "वेंडर जोड़ा गया",
    gu: "વેન્ડર ઉમેરાયો",
  },
  "Vendor deleted": {
    hi: "वेंडर हटाया गया",
    gu: "વેન્ડર કાઢી નાખવામાં આવ્યો",
  },
  "Vendor name is required": {
    hi: "वेंडर का नाम आवश्यक है",
    gu: "વેન્ડરનું નામ જરૂરી છે",
  },
  "Vendor not found": {
    hi: "वेंडर नहीं मिला",
    gu: "વેન્ડર મળ્યો નથી",
  },
  "Vendor phone is required": {
    hi: "वेंडर का फ़ोन आवश्यक है",
    gu: "વેન્ડરનો ફોન જરૂરી છે",
  },
  "Vendor updated": {
    hi: "वेंडर अपडेट हुआ",
    gu: "વેન્ડર અપડેટ થયો",
  },
  "You can complete this order only after the last event has finished": {
    hi: "अंतिम कार्यक्रम समाप्त होने के बाद ही यह ऑर्डर पूर्ण किया जा सकता है",
    gu: "છેલ્લો કાર્યક્રમ પૂરો થયા પછી જ આ ઓર્ડર પૂર્ણ કરી શકાય છે",
  },
  "You do not have permission to delete this item.": {
    hi: "आपको यह आइटम हटाने की अनुमति नहीं है।",
    gu: "તમને આ આઇટમ કાઢવાની પરવાનગી નથી.",
  },
  "You do not have permission to update this item.": {
    hi: "आपको यह आइटम बदलने की अनुमति नहीं है।",
    gu: "તમને આ આઇટમ બદલવાની પરવાનગી નથી.",
  },
  "Your message has been sent. We'll get back to you soon.": {
    hi: "आपका संदेश भेज दिया गया है। हम जल्द ही संपर्क करेंगे।",
    gu: "તમારો સંદેશ મોકલાઈ ગયો છે. અમે જલ્દી સંપર્ક કરીશું.",
  },
  "Quantity cannot exceed remaining stock for this utensil": {
    hi: "मात्रा इस बर्तन के बचे हुए स्टॉक से अधिक नहीं हो सकती",
    gu: "જથ્થો આ વાસણના બાકી સ્ટોક કરતાં વધુ ન હોઈ શકે",
  },
  "damaged_count cannot exceed available_count": {
    hi: "खराब संख्या कुल से अधिक नहीं हो सकती",
    gu: "નુકસાન સંખ્યા કુલ કરતાં વધુ ન હોઈ શકે",
  },
  "Your session has been ended because you logged in on another device.": {
    hi: "आपने किसी दूसरे डिवाइस पर लॉगिन किया है, इसलिए यह सत्र समाप्त हो गया।",
    gu: "તમે બીજા ડિવાઇસ પર લૉગિન કર્યું હોવાથી આ સત્ર સમાપ્ત થયું છે.",
  },
};

/** Display names for the seeded units, by slug. Custom units keep their own name. */
const UNIT_NAME_TRANSLATIONS = {
  kg: { hi: "किलोग्राम", gu: "કિલોગ્રામ" },
  g: { hi: "ग्राम", gu: "ગ્રામ" },
  ltr: { hi: "लीटर", gu: "લિટર" },
  ml: { hi: "मिलीलीटर", gu: "મિલીલિટર" },
  qtl: { hi: "क्विंटल", gu: "ક્વિન્ટલ" },
  pcs: { hi: "नग", gu: "નંગ" },
  dozen: { hi: "दर्जन", gu: "ડઝન" },
  pkt: { hi: "पैकेट", gu: "પેકેટ" },
  box: { hi: "डिब्बा", gu: "બોક્સ" },
  bag: { hi: "थैला", gu: "થેલી" },
  bottle: { hi: "बोतल", gu: "બોટલ" },
  can: { hi: "कैन", gu: "કેન" },
  pers: { hi: "व्यक्ति", gu: "વ્યક્તિ" },
  qty: { hi: "मात्रा", gu: "જથ્થો" },
};

function translateMessage(message, lang) {
  if (lang === "en" || typeof message !== "string") return message;
  return MESSAGE_TRANSLATIONS[message]?.[lang] ?? message;
}

function translateUnitName(slug, name, lang) {
  if (lang === "en") return name;
  return UNIT_NAME_TRANSLATIONS[String(slug ?? "").toLowerCase()]?.[lang] ?? name;
}

module.exports = { translateMessage, translateUnitName };
