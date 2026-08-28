const prisma = require("../config/prisma");
const jwt = require("jsonwebtoken");
const { successResponse, errorResponse } = require("../utils/response");
const { formatBusinessDetail } = require("./authController");
const {
  deriveDefaultPdfPrefix,
  formatUserResponse,
  isUnsetPdfPrefix,
} = require("../utils/formatUser");
const {
  getRequestedLanguage,
  normalizeLocalizedName,
  resolveLocalizedName,
} = require("../utils/localization");
const { uploadBase64ToBucket } = require("../utils/uploadBase64Image");
const { sendPushNotifications } = require("../utils/expoPush");
const { getNotificationContent } = require("../utils/notificationTranslations");
const { ensureSettings } = require("./adminSettingsController");

const TRIAL_DAYS = 30;
const BUSINESS_LOGO_BUCKET = "business_profile_pictures";

async function resolveBusinessLogoUrl({ business_logo, business_logo_base64, business_logo_mime }) {
  if (business_logo_base64) {
    return uploadBase64ToBucket({
      bucket: BUSINESS_LOGO_BUCKET,
      base64: business_logo_base64,
      mime: business_logo_mime,
      logLabel: "registerBusiness",
    });
  }
  const url = typeof business_logo === "string" ? business_logo.trim() : "";
  if (url && /^https?:\/\//i.test(url)) {
    return { ok: true, url };
  }
  return { ok: true, url: url || null };
}

const ALLOWED_CATERING = new Set(["veg", "non_veg"]);
/**
 * POST /api/v1/createServiceTypes
 * Body: { names: ["Live Counter", "Outdoor Catering"] }
 * Auth: required
 * Creates service types that don't already exist and returns all of them.
 */
exports.createServiceTypes = async (req, res) => {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const { names, items } = req.body;

    const rawItems = Array.isArray(items) && items.length > 0
      ? items
      : Array.isArray(names)
        ? names
        : [];

    if (rawItems.length === 0) {
      return errorResponse(
        res,
        "items or names array is required",
        200,
        "VALIDATION_ERROR",
      );
    }

    const normalizedItems = rawItems
      .map((entry) => {
        if (typeof entry === "string") {
          return { name: normalizeLocalizedName(entry) };
        }
        const localized = normalizeLocalizedName(entry?.name);
        if (!localized) return null;

        return {
          name: localized,
          slug:
            typeof entry.slug === "string" && entry.slug.trim()
              ? entry.slug.trim()
              : undefined,
          icon:
            typeof entry.icon === "string" && entry.icon.trim()
              ? entry.icon.trim()
              : null,
          status: Number(entry.status) === 0 ? 0 : 1,
        };
      })
      .filter(Boolean);

    if (normalizedItems.length === 0) {
      return errorResponse(
        res,
        "At least one non-empty name is required",
        200,
        "VALIDATION_ERROR",
      );
    }

    const results = [];

    for (const item of normalizedItems) {
      const slugSource = item.slug || item.name.en;
      let slug = slugSource.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      if (!slug) slug = `custom-${Date.now()}`;

      // Use upsert to avoid unique constraint race conditions
      const row = await prisma.serviceType.upsert({
        where: { slug },
        update: {},              // already exists — do nothing
        create: {
          name: item.name,
          slug,
          icon: item.icon,
          status: item.status,
        },
      });

      results.push({
        id: row.id,
        name: resolveLocalizedName(row.name, requestedLanguage),
        slug: row.slug,
        icon: row.icon,
        status: row.status,
      });
    }

    return successResponse(res, "Service types added successfully", results, 201);
  } catch (error) {
    console.error("createServiceTypes error:", error.message, error.stack);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.listServiceTypes = async (req, res) => {
  try {
    const requestedLanguage = getRequestedLanguage(req);
    const rows = await prisma.serviceType.findMany({
      where: { status: 1 },
      orderBy: { id: "asc" },
    });

    const data = rows.map((r) => ({
      id: r.id,
      name: resolveLocalizedName(r.name, requestedLanguage),
      slug: r.slug,
      icon: r.icon,
      status: r.status,
    }));

    return successResponse(res, "Service types fetched successfully", data, 200);
  } catch (error) {
    console.error("listServiceTypes error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.registerBusiness = async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      business_logo,
      business_logo_base64,
      business_logo_mime,
      business_name,
      business_owner_name,
      same_as_owner_number,
      contact_number,
      business_email,
      business_address,
      service_types,
      catering_types,
      years_of_experience,
      business_register_number,
      gst_number,
    } = req.body;

    const yoe = years_of_experience !== undefined ? Number(years_of_experience) : 0;
    if (
      !business_name ||
      !business_address ||
      !contact_number
    ) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return errorResponse(res, "No account found for the given email", 404, "USER_NOT_FOUND");
    }

    let resolvedContact;
    if (same_as_owner_number === true) {
      if (!user.phoneNumber) {
        return errorResponse(
          res,
          "One or more required fields are missing or malformed",
          200,
          "VALIDATION_ERROR",
          "User has no contact number to use when same_as_owner_number is true.",
        );
      }
      resolvedContact = user.phoneNumber;
    } else {
      resolvedContact = contact_number;
    }

    if (!resolvedContact) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    if (Array.isArray(catering_types)) {
      for (const ct of catering_types) {
        if (!ALLOWED_CATERING.has(ct)) {
          return errorResponse(
            res,
            "One or more required fields are missing or malformed",
            200,
            "VALIDATION_ERROR",
            "catering_types must only include veg and non_veg.",
          );
        }
      }
    }

    if (user.businessId) {
      return errorResponse(
        res,
        "Business already registered for this user",
        200,
        "VALIDATION_ERROR",
      );
    }

    let existingSlugs = [];
    if (Array.isArray(service_types) && service_types.length > 0) {
      const uniqueSlugs = [...new Set(service_types)];
      existingSlugs = await prisma.serviceType.findMany({
        where: { slug: { in: uniqueSlugs }, status: 1 },
      });

      if (existingSlugs.length !== uniqueSlugs.length) {
        return errorResponse(
          res,
          "One or more required fields are missing or malformed",
          200,
          "VALIDATION_ERROR",
          "Invalid service_types slug(s). Use values from GET /v1/getservicetypes.",
        );
      }
    }

    const logoResult = await resolveBusinessLogoUrl({
      business_logo,
      business_logo_base64,
      business_logo_mime,
    });
    if (!logoResult.ok) {
      const status = logoResult.code === "UPLOAD_ERROR" ? 500 : 422;
      return errorResponse(res, logoResult.message, status, logoResult.code);
    }
    const resolvedLogoUrl = logoResult.url;

    const now = new Date();
    const subscriptionEnd = new Date(now);
    subscriptionEnd.setDate(subscriptionEnd.getDate() + TRIAL_DAYS);

    // Admin-configured platform defaults for a new business's service
    // charge/tax — a one-time seed onto the Business row; once set, the
    // owner's own edits (via updateBusiness) are what pricing reads from.
    const appSettings = await ensureSettings();

    const fullBusiness = await prisma.$transaction(async (tx) => {
      const b = await tx.business.create({
        data: {
          logoUrl: resolvedLogoUrl,
          name: business_name,
          ownerName: business_owner_name ?? "",
          sameAsOwnerNumber: Boolean(same_as_owner_number),
          contactNumber: resolvedContact,
          email: business_email ?? "",
          address: business_address,
          cateringTypes: Array.isArray(catering_types) ? catering_types : [],
          yearsExperience: Number.isFinite(yoe) ? yoe : 0,
          registrationNumber: business_register_number ?? "",
          gstNumber: gst_number ?? "",
          subscriptionStatus: "trial",
          subscriptionPlan: "FREE",
          subscriptionStart: now,
          subscriptionEnd,
          isTrialUsed: false,
          createdByUserId: userId,
          isProfileCompleted: true,
          defaultServiceChargePct: appSettings.defaultServiceChargePct,
          defaultTaxPct: appSettings.defaultTaxPct,
        },
      });

      if (existingSlugs.length > 0) {
        await tx.businessServiceType.createMany({
          data: existingSlugs.map((st) => ({
            businessId: b.id,
            serviceTypeId: st.id,
          })),
        });
      }

      const userUpdate = { businessId: b.id };
      if (isUnsetPdfPrefix(user.pdfPrefix)) {
        userUpdate.pdfPrefix = deriveDefaultPdfPrefix(business_name);
      }

      await tx.user.update({
        where: { id: userId },
        data: userUpdate,
      });

      return tx.business.findUnique({
        where: { id: b.id },
        include: {
          serviceLinks: { include: { serviceType: true } },
        },
      });
    });

    if (!fullBusiness) {
      return errorResponse(res, "Server error", 500, "ERROR");
    }

    // Preserve sessionVersion so the issued token passes the single-device check
    // in authMiddleware. Omitting it makes decoded.sessionVersion === undefined,
    // which never matches the DB integer and instantly triggers SESSION_DISPLACED.
    const token = jwt.sign(
      { userId, businessId: fullBusiness.id, role: user.role, sessionVersion: req.user.sessionVersion },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    const business_details = [formatBusinessDetail(fullBusiness)];

    const refreshed = {
      ...user,
      businessId: fullBusiness.id,
      pdfPrefix: isUnsetPdfPrefix(user.pdfPrefix)
        ? deriveDefaultPdfPrefix(business_name)
        : user.pdfPrefix,
    };

    const formattedUser = formatUserResponse(refreshed, {
      status: 1,
      device_type: user.deviceType ?? null,
      device_token: user.deviceToken ?? null,
      business_details,
    });

    // Fire welcome notification in background — non-blocking so response is not delayed.
    const _wUserId = userId;
    const _wToken  = user.deviceToken;
    const _wNotif  = user.notificationStatus;
    const _wLang   = user.language;
    Promise.resolve()
      .then(async () => {
        const { title, body } = getNotificationContent("welcome", _wLang);
        const data = { screen: "newBooking" };

        await prisma.userNotification.create({
          data: { userId: _wUserId, title, body, type: "business_welcome", data },
        });

        if (_wToken && _wNotif === 1) {
          await sendPushNotifications([_wToken], { title, body, data });
        }
      })
      .catch((err) =>
        console.error("[WelcomeNotif] Failed for user", _wUserId, ":", err.message),
      );

    return successResponse(
      res,
      "Business registered successfully",
      {
        token,
        user: formattedUser,
      },
      201,
    );
  } catch (error) {
    console.error("registerBusiness error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.updateBusiness = async (req, res) => {
  try {
    const userId = req.user.userId;
    const businessId = req.businessId;

    if (!businessId) {
      return errorResponse(
        res,
        "No business context. Register a business first.",
        400,
        "NO_BUSINESS",
      );
    }

    const {
      business_name,
      business_logo,
      gst_number,
      business_address,
      contact_number,
      business_email,
      default_service_charge_pct,
      default_tax_pct,
      terms_and_conditions,
    } = req.body;

    const data = {};
    if (business_name !== undefined) {
      const trimmed = String(business_name).trim();
      if (!trimmed) {
        return errorResponse(
          res,
          "Business name cannot be empty",
          200,
          "VALIDATION_ERROR",
        );
      }
      data.name = trimmed;
    }
    if (business_logo !== undefined) {
      const v = String(business_logo).trim();
      data.logoUrl = v || null;
    }
    if (gst_number !== undefined) {
      data.gstNumber = String(gst_number).trim() || "";
    }
    if (business_address !== undefined) {
      data.address = String(business_address).trim() || null;
    }
    if (contact_number !== undefined) {
      const digits = String(contact_number).replace(/\D/g, "").slice(0, 10);
      data.contactNumber = digits || null;
    }
    if (business_email !== undefined) {
      data.email = String(business_email).trim() || "";
    }
    if (default_service_charge_pct !== undefined) {
      const sc = Number(default_service_charge_pct);
      if (!Number.isFinite(sc) || sc < 0 || sc > 100) {
        return errorResponse(
          res,
          "Service charge % must be between 0 and 100",
          400,
          "VALIDATION_ERROR",
        );
      }
      data.defaultServiceChargePct = sc;
    }
    if (default_tax_pct !== undefined) {
      const tx = Number(default_tax_pct);
      if (!Number.isFinite(tx) || tx < 0 || tx > 100) {
        return errorResponse(
          res,
          "Tax % must be between 0 and 100",
          400,
          "VALIDATION_ERROR",
        );
      }
      data.defaultTaxPct = tx;
    }
    if (terms_and_conditions !== undefined) {
      const trimmed = String(terms_and_conditions).trim();
      if (trimmed.length > 4000) {
        return errorResponse(
          res,
          "Terms & Conditions must be under 4000 characters",
          200,
          "VALIDATION_ERROR",
        );
      }
      data.termsAndConditions = trimmed || null;
    }

    if (Object.keys(data).length === 0) {
      return errorResponse(
        res,
        "No fields to update",
        200,
        "VALIDATION_ERROR",
      );
    }

    await prisma.business.update({
      where: { id: businessId },
      data,
    });

    const fullBusiness = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        serviceLinks: { include: { serviceType: true } },
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !fullBusiness) {
      return errorResponse(res, "Not found", 404, "NOT_FOUND");
    }

    // Preserve the current sessionVersion — a business update is not a new login,
    // so we must not omit it (that would make decoded.sessionVersion === undefined,
    // which never matches the DB value and instantly triggers the "another device" logout).
    const token = jwt.sign(
      { userId, businessId, role: user.role, sessionVersion: req.user.sessionVersion },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    const business_details = [formatBusinessDetail(fullBusiness)];

    const formattedUser = formatUserResponse(user, {
      status: 1,
      device_type: user.deviceType ?? null,
      device_token: user.deviceToken ?? null,
      business_details,
    });

    return successResponse(
      res,
      "Business profile updated successfully",
      {
        token,
        user: formattedUser,
      },
      200,
    );
  } catch (error) {
    console.error("updateBusiness error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/**
 * DELETE /api/v1/deleteBusiness
 * Auth + business context required.
 * Fully removes the business and all related data (cascade).
 * Unlinks all users from the business first.
 */
exports.deleteBusiness = async (req, res) => {
  try {
    const userId = req.user.userId;
    const businessId = req.businessId;

    if (!businessId) {
      return errorResponse(
        res,
        "No business context. Register a business first.",
        400,
        "NO_BUSINESS",
      );
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      return errorResponse(res, "Business not found", 404, "NOT_FOUND");
    }

    if (business.createdByUserId !== userId) {
      return errorResponse(
        res,
        "Only the business owner can delete this business",
        403,
        "FORBIDDEN",
      );
    }

    await prisma.$transaction(async (tx) => {
      // Unlink all users from this business
      await tx.user.updateMany({
        where: { businessId },
        data: { businessId: null },
      });

      // Delete booking menu items and quotation menu items first
      // (they have onDelete: Restrict on menuItemId, blocking cascade)
      const menuItemIds = (
        await tx.menuItem.findMany({
          where: { businessId },
          select: { id: true },
        })
      ).map((m) => m.id);

      if (menuItemIds.length > 0) {
        await tx.bookingMenuItem.deleteMany({
          where: { menuItemId: { in: menuItemIds } },
        });
        await tx.quotationMenuItem.deleteMany({
          where: { menuItemId: { in: menuItemIds } },
        });
      }

      // Delete the business (cascades to service links, menu items, bookings, quotations, billing)
      await tx.business.delete({
        where: { id: businessId },
      });
    });

    return successResponse(
      res,
      "Business deleted successfully",
      null,
      200,
    );
  } catch (error) {
    console.error("deleteBusiness error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
