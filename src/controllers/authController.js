const prisma = require("../config/prisma");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const { successResponse, errorResponse } = require("../utils/response");
const { sendOtpEmail } = require("../utils/email");
const { logActivity } = require("../utils/activityLog");
const {
  formatUserResponse,
  linkedAccounts,
  validatePdfPrefix,
} = require("../utils/formatUser");
const { SUPPORTED_LANGUAGE_CODES } = require("../utils/localization");

const googleClient = new OAuth2Client();

const validatePassword = (password) => {
  const regex = /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
  return regex.test(password);
};

/** Device type the web admin panel signs in with (not iOS/Android). */
const ADMIN_WEB_DEVICE_TYPE = 3;
/** Admin panel tokens expire; mobile app tokens do not (they end only on displacement). */
const ADMIN_WEB_TOKEN_TTL = "12h";

const signInTokenOptions = (role, deviceType) =>
  role === "admin" && Number(deviceType) === ADMIN_WEB_DEVICE_TYPE
    ? { expiresIn: ADMIN_WEB_TOKEN_TTL }
    : {};

/** 1 if a non-empty device_token is provided, otherwise 0 */
function notificationStatusFromDeviceToken(device_token) {
  return device_token != null && String(device_token).trim() !== "" ? 1 : 0;
}

/**
 * Single-device policy: store the current device's token directly on the
 * User row. Replaces the previous token in one atomic update.
 */
async function setUserDevice(userId, deviceType, deviceToken) {
  if (deviceType === undefined) return;
  await prisma.user.update({
    where: { id: userId },
    data: {
      deviceToken: deviceToken ?? null,
      deviceType,
    },
  });
}

function formatBusinessDetail(business) {
  const service_types = (business.serviceLinks || []).map(
    (l) => l.serviceType.slug,
  );
  const owners = [...(business.owners || [])]
    .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || a.sortOrder - b.sortOrder)
    .map((o) => ({
      id: o.id,
      name: o.name,
      phone: o.phone,
      is_primary: o.isPrimary,
    }));
  const primaryOwner = owners.find((o) => o.is_primary) ?? owners[0] ?? null;
  return {
    id: business.id,
    business_logo: business.logoUrl,
    business_name: business.name,
    // Mirrors the primary BusinessOwner (source of truth going forward) so this legacy
    // field stays accurate even after an owners-only edit that never touches the
    // legacy `ownerName` column; falls back to that column only when no owners exist.
    business_owner_name: primaryOwner?.name ?? business.ownerName,
    same_as_owner_number: business.sameAsOwnerNumber,
    contact_number: business.contactNumber,
    owners,
    business_email: business.email ?? "",
    business_address: business.address,
    service_types,
    catering_types: business.cateringTypes || [],
    years_of_experience: business.yearsExperience,
    business_register_number: business.registrationNumber ?? "",
    gst_number: business.gstNumber ?? "",
    terms_and_conditions: business.termsAndConditions ?? "",
    subscription: {
      status: business.subscriptionStatus ?? "trial",
      plan: business.subscriptionPlan ?? "FREE",
      start: business.subscriptionStart?.toISOString() ?? null,
      end: business.subscriptionEnd?.toISOString() ?? null,
    },
    is_trial_used: business.isTrialUsed,
    default_service_charge_pct: Number(business.defaultServiceChargePct ?? 10),
    default_tax_pct: Number(business.defaultTaxPct ?? 5),
  };
}

async function loadBusinessDetailsArray(businessId) {
  if (!businessId) return [];
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      serviceLinks: { include: { serviceType: true } },
      owners: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
    },
  });
  if (!business) return [];
  return [formatBusinessDetail(business)];
}

exports.signup = async (req, res) => {
  try {
    const {
      name,
      email,
      contact,
      password,
      device_type,
      device_token,
    } = req.body;

    if (
      !name ||
      !email ||
      !password ||
      !contact ||
      device_type === undefined
    ) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    if (!validatePassword(password)) {
      return errorResponse(
        res,
        "Password must be 8 characters, include 1 uppercase, 1 number and 1 special character",
        200,
        "VALIDATION_ERROR",
      );
    }

    const phoneDigits = String(contact).replace(/\D/g, "").slice(0, 10);
    if (!phoneDigits) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return errorResponse(res, "Email already registered.", 200, "USER_EXISTS");
    }

    const existingByPhone = await prisma.user.findFirst({
      where: { phoneNumber: phoneDigits },
    });

    if (existingByPhone) {
      return errorResponse(res, "Phone number already registered.", 200, "USER_EXISTS");
    }

    const hashedPassword = await bcrypt.hash(password, 8);

    const notificationStatus = notificationStatusFromDeviceToken(device_token);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: hashedPassword,
        phoneNumber: phoneDigits,
        businessId: null,
        notificationStatus,
      },
    });

    await setUserDevice(user.id, device_type, device_token);

    await prisma.otpCode.deleteMany({
      where: { email, type: "signup" },
    });

    const otp = Math.floor(100000 + 900000 * Math.random()).toString();

    await prisma.otpCode.create({
      data: {
        email,
        otp,
        type: "signup",
        expiresAt: new Date(Date.now() + 120 * 1000),
      },
    });

    sendOtpEmail(email, otp, "signup").catch((emailErr) => {
      console.error("Signup OTP email failed:", emailErr.message);
    });

    // sessionVersion starts at 0 for a new user (default in DB)
    const token = jwt.sign(
      { userId: user.id, businessId: null, role: user.role, sessionVersion: 0 },
      process.env.JWT_SECRET,
      {},
    );

    const formattedUser = formatUserResponse(user, {
      user_type: 1,
      email_verified_at: null,
      device_type,
      device_token: device_token || null,
    });

    return res.status(200).json({
      success: true,
      message: "User registered successfully.",
      data: {
        token,
        user: formattedUser,
      },
    });
  } catch (error) {
    console.error("Signup error:", error.message);
    if (error.code === "P2002") {
      const target = error.meta?.target;
      const fields = Array.isArray(target) ? target : target != null ? [target] : [];
      if (fields.some((f) => String(f).toLowerCase().includes("email"))) {
        return errorResponse(res, "Email already registered.", 200, "USER_EXISTS");
      }
      if (fields.some((f) => String(f).toLowerCase().includes("phone"))) {
        return errorResponse(res, "Phone number already registered.", 200, "USER_EXISTS");
      }
    }
    return errorResponse(res, "User registration failed.", 500, "ERROR");
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return errorResponse(res, "No account found for the given email", 404, "USER_NOT_FOUND");
    }

    const existingOtp = await prisma.otpCode.findFirst({
      where: {
        email,
        type: "signup",
        isUsed: false,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!existingOtp) {
      return errorResponse(res, "OTP is incorrect or has expired", 200, "INVALID_OTP");
    }

    if (existingOtp.attempts >= 5) {
      return errorResponse(res, "OTP is incorrect or has expired", 200, "INVALID_OTP");
    }

    if (new Date() > existingOtp.expiresAt) {
      return errorResponse(res, "OTP is incorrect or has expired", 200, "INVALID_OTP");
    }

    if (existingOtp.otp !== otp) {
      await prisma.otpCode.update({
        where: { id: existingOtp.id },
        data: { attempts: existingOtp.attempts + 1 },
      });

      return errorResponse(res, "OTP is incorrect or has expired", 200, "INVALID_OTP");
    }

    await prisma.otpCode.update({
      where: { id: existingOtp.id },
      data: { isUsed: true },
    });

    const verifiedAt = new Date();
    const updatedUser = await prisma.user.update({
      where: { email },
      data: { isVerified: true, userVerifiedAt: verifiedAt },
    });

    const token = jwt.sign(
      {
        userId: updatedUser.id,
        businessId: updatedUser.businessId,
        role: updatedUser.role,
        sessionVersion: updatedUser.sessionVersion,
      },
      process.env.JWT_SECRET,
      {},
    );

    const formattedUser = formatUserResponse(updatedUser, {
      status: 1,
      user_type: 1,
      user_verified_at: verifiedAt.toISOString(),
      device_type: updatedUser.deviceType ?? null,
      device_token: updatedUser.deviceToken ?? null,
    });

    return successResponse(
      res,
      "OTP verified successfully",
      {
        token,
        user: formattedUser,
      },
      200,
    );
  } catch (error) {
    console.error("Verify OTP error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.signIn = async (req, res) => {
  try {
    const { email, password, device_type, device_token } = req.body;

    if (!email || !password || device_type === undefined) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return errorResponse(
        res,
        "Email or password is incorrect",
        200,
        "INVALID_CREDENTIALS",
      );
    }

    if (!user.passwordHash) {
      const usesGoogle = Boolean(user.googleId);
      return errorResponse(
        res,
        `This account uses ${usesGoogle ? "Google" : "Facebook"} sign-in. Continue with ${usesGoogle ? "Google" : "Facebook"}, or use Forgot Password to set a password.`,
        200,
        usesGoogle ? "GOOGLE_ACCOUNT" : "FACEBOOK_ACCOUNT",
      );
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return errorResponse(
        res,
        "Email or password is incorrect",
        200,
        "INVALID_CREDENTIALS",
      );
    }

    if (!user.isVerified) {
      await prisma.otpCode.deleteMany({
        where: { email, type: "signup" },
      });

      const otp = Math.floor(100000 + 900000 * Math.random()).toString();

      await prisma.otpCode.create({
        data: {
          email,
          otp,
          type: "signup",
          expiresAt: new Date(Date.now() + 120 * 1000),
        },
      });

      sendOtpEmail(email, otp, "signup").catch((emailErr) => {
        console.error("Login OTP email failed:", emailErr.message);
      });

      // Merge session + device writes into one round-trip, load business in parallel.
      const notificationStatusUnverified = notificationStatusFromDeviceToken(device_token);
      const [updatedUnverified, unverifiedBusinessDetails] = await Promise.all([
        prisma.user.update({
          where: { id: user.id },
          data: {
            notificationStatus: notificationStatusUnverified,
            sessionVersion: { increment: 1 },
            deviceToken: device_type !== undefined ? (device_token ?? null) : undefined,
            deviceType: device_type !== undefined ? device_type : undefined,
          },
        }),
        loadBusinessDetailsArray(user.businessId),
      ]);

      const token = jwt.sign(
        {
          userId: updatedUnverified.id,
          businessId: updatedUnverified.businessId,
          role: updatedUnverified.role,
          sessionVersion: updatedUnverified.sessionVersion,
        },
        process.env.JWT_SECRET,
        signInTokenOptions(updatedUnverified.role, device_type),
      );

      const formattedUser = formatUserResponse(updatedUnverified, {
        status: 1,
        device_type,
        device_token: device_token || null,
        business_details: unverifiedBusinessDetails,
      });

      return res.status(200).json({
        success: true,
        message: "Account not verified. OTP sent again.",
        data: {
          token,
          user: formattedUser,
        },
      });
    }

    // Merge the two writes (session + device) into one round-trip, and run the
    // business lookup in parallel — cuts 2 sequential DB calls down to 1.
    const notificationStatus = notificationStatusFromDeviceToken(device_token);
    const [updatedUser, business_details] = await Promise.all([
      prisma.user.update({
        where: { id: user.id },
        data: {
          notificationStatus,
          sessionVersion: { increment: 1 },
          deviceToken: device_type !== undefined ? (device_token ?? null) : undefined,
          deviceType: device_type !== undefined ? device_type : undefined,
        },
      }),
      loadBusinessDetailsArray(user.businessId),
    ]);

    const token = jwt.sign(
      {
        userId: updatedUser.id,
        businessId: updatedUser.businessId,
        role: updatedUser.role,
        sessionVersion: updatedUser.sessionVersion,
      },
      process.env.JWT_SECRET,
      signInTokenOptions(updatedUser.role, device_type),
    );

    const formattedUser = formatUserResponse(updatedUser, {
      status: 1,
      device_type,
      device_token: device_token || null,
      business_details,
    });

    if (updatedUser.role === "admin") {
      logActivity({
        type: "admin_login",
        message: `Admin login: ${updatedUser.email}`,
        actorUserId: updatedUser.id,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        token,
        user: formattedUser,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

const SOCIAL_PROVIDERS = {
  google: { idField: "googleId", label: "Google" },
  facebook: { idField: "facebookId", label: "Facebook" },
};

/**
 * Shared tail of Google/Facebook sign-in once the provider token is verified.
 * Looks up by provider id, then by email (case-insensitive) and links it;
 * unknown emails get a new verified owner account with no password.
 */
async function completeSocialSignIn(
  res,
  { provider, providerId, email: rawEmail, name, picture, device_type, device_token, language },
) {
  const { idField, label } = SOCIAL_PROVIDERS[provider];
  const email = rawEmail.toLowerCase();

  let user =
    (await prisma.user.findUnique({ where: { [idField]: providerId } })) ||
    (await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    }));

  if (user?.deletedAt) {
    return errorResponse(res, "Account not found", 200, "USER_NOT_FOUND");
  }

  // Admin accounts sign in with a password only, so a linked social account can never grant admin access.
  if (user?.role === "admin") {
    return errorResponse(
      res,
      "Admin accounts must sign in with email and password.",
      200,
      "SOCIAL_SIGNIN_NOT_ALLOWED",
    );
  }

  let isNewUser = false;
  const notificationStatus = notificationStatusFromDeviceToken(device_token);
  const deviceData = {
    notificationStatus,
    deviceToken: device_token ?? null,
    deviceType: device_type,
  };

  if (!user) {
    isNewUser = true;
    user = await prisma.user.create({
      data: {
        name: name || email.split("@")[0],
        email,
        [idField]: providerId,
        authProvider: provider,
        profileImageUrl: picture ?? null,
        isVerified: true,
        userVerifiedAt: new Date(),
        ...(SUPPORTED_LANGUAGE_CODES.has(language) ? { language } : {}),
        ...deviceData,
      },
    });
  } else {
    const linking = !user[idField];
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...deviceData,
        sessionVersion: { increment: 1 },
        ...(linking ? { [idField]: providerId } : {}),
        ...(linking && provider === "google"
          ? { authProvider: user.passwordHash ? "both" : "google" }
          : {}),
        // The provider has confirmed this email, so a pending OTP verification is no longer needed.
        ...(!user.isVerified ? { isVerified: true, userVerifiedAt: new Date() } : {}),
        ...(!user.profileImageUrl && picture ? { profileImageUrl: picture } : {}),
      },
    });
  }

  const business_details = await loadBusinessDetailsArray(user.businessId);

  const token = jwt.sign(
    {
      userId: user.id,
      businessId: user.businessId,
      role: user.role,
      sessionVersion: user.sessionVersion,
    },
    process.env.JWT_SECRET,
    signInTokenOptions(user.role, device_type),
  );

  const formattedUser = formatUserResponse(user, {
    status: 1,
    device_type,
    device_token: device_token || null,
    business_details,
  });

  logActivity({
    type: `${provider}_${isNewUser ? "signup" : "login"}`,
    message: `${label} ${isNewUser ? "signup" : "login"}: ${user.email}`,
    actorUserId: user.id,
  });

  return res.status(200).json({
    success: true,
    message: "Login successful",
    data: {
      token,
      user: formattedUser,
      is_new_user: isNewUser,
    },
  });
}

/** Verifies a Google ID token for our client ID; returns the payload, or null if invalid/unverified. */
async function verifyGoogleIdToken(idToken) {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_WEB_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    return payload?.sub && payload.email && payload.email_verified ? payload : null;
  } catch (verifyErr) {
    console.error("Google token verification failed:", verifyErr.message);
    return null;
  }
}

/**
 * Verifies a Facebook user access token belongs to our Meta app, then reads the
 * user's profile. Returns null when the token is invalid or for another app.
 */
async function fetchFacebookProfile(accessToken) {
  const appId = process.env.FB_APP_ID;
  const appToken = `${appId}|${process.env.FB_APP_SECRET}`;
  const graph = "https://graph.facebook.com";
  const timeout = () => AbortSignal.timeout(10000);

  const debugRes = await fetch(
    `${graph}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`,
    { signal: timeout() },
  );
  const debug = (await debugRes.json())?.data;
  if (!debug?.is_valid || String(debug.app_id) !== String(appId) || !debug.user_id) {
    return null;
  }

  const proof = crypto
    .createHmac("sha256", process.env.FB_APP_SECRET)
    .update(accessToken)
    .digest("hex");
  const meRes = await fetch(
    `${graph}/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(accessToken)}&appsecret_proof=${proof}`,
    { signal: timeout() },
  );
  const me = await meRes.json();
  if (!me?.id || String(me.id) !== String(debug.user_id)) return null;

  const pic = me.picture?.data;
  return {
    id: String(me.id),
    name: me.name,
    email: me.email,
    picture: pic && !pic.is_silhouette ? pic.url : null,
  };
}

/**
 * POST /v1/facebook-signin
 *
 * Same flow as Google sign-in, with a Facebook user access token. Facebook
 * accounts without a shared email are rejected (FACEBOOK_EMAIL_REQUIRED) so every
 * account keeps a real email for OTP and password reset.
 */
exports.facebookSignIn = async (req, res) => {
  try {
    const { access_token, device_type, device_token, language } = req.body;

    if (!access_token || device_type === undefined) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    if (!process.env.FB_APP_ID || !process.env.FB_APP_SECRET) {
      console.error("Facebook sign-in error: FB_APP_ID / FB_APP_SECRET is not set");
      return errorResponse(res, "Server error", 500, "ERROR");
    }

    let profile;
    try {
      profile = await fetchFacebookProfile(access_token);
    } catch (verifyErr) {
      console.error("Facebook token verification failed:", verifyErr.message);
      profile = null;
    }
    if (!profile) {
      return errorResponse(res, "Facebook sign-in failed", 200, "INVALID_FACEBOOK_TOKEN");
    }

    if (!profile.email) {
      return errorResponse(
        res,
        "Your Facebook account did not share an email address. Allow email access, or sign up with Google or email.",
        200,
        "FACEBOOK_EMAIL_REQUIRED",
      );
    }

    return await completeSocialSignIn(res, {
      provider: "facebook",
      providerId: profile.id,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      device_type,
      device_token,
      language,
    });
  } catch (error) {
    console.error("Facebook sign-in error:", error.message);
    if (error.code === "P2002") {
      return errorResponse(res, "Email already registered.", 200, "USER_EXISTS");
    }
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/**
 * POST /v1/google-signin
 *
 * Verifies a Google ID token from the app and signs the user in. Looks up by
 * googleId first, then by email (case-insensitive) — an existing email/password
 * or staff account is linked to the Google account. Unknown emails get a new
 * verified owner account with no password, which then goes through onboarding.
 */
exports.googleSignIn = async (req, res) => {
  try {
    const { id_token, device_type, device_token, language } = req.body;

    if (!id_token || device_type === undefined) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    if (!process.env.GOOGLE_WEB_CLIENT_ID) {
      console.error("Google sign-in error: GOOGLE_WEB_CLIENT_ID is not set");
      return errorResponse(res, "Server error", 500, "ERROR");
    }

    const payload = await verifyGoogleIdToken(id_token);
    if (!payload) {
      return errorResponse(res, "Google sign-in failed", 200, "INVALID_GOOGLE_TOKEN");
    }

    return await completeSocialSignIn(res, {
      provider: "google",
      providerId: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      device_type,
      device_token,
      language,
    });
  } catch (error) {
    console.error("Google sign-in error:", error.message);
    if (error.code === "P2002") {
      return errorResponse(res, "Email already registered.", 200, "USER_EXISTS");
    }
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/**
 * POST /v1/user/link-social  (requires auth)
 *
 * Connects a Google or Facebook account to the signed-in user, even when its
 * email differs from the KatMitra email. A provider account already linked to a
 * different user is rejected, so this never merges two KatMitra accounts.
 */
exports.linkSocialAccount = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { provider, token } = req.body;
    const config = SOCIAL_PROVIDERS[provider];

    if (!config || !token) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    let providerId = null;
    if (provider === "google") {
      providerId = (await verifyGoogleIdToken(token))?.sub ?? null;
    } else {
      try {
        providerId = (await fetchFacebookProfile(token))?.id ?? null;
      } catch (verifyErr) {
        console.error("Facebook token verification failed:", verifyErr.message);
      }
    }
    if (!providerId) {
      return errorResponse(
        res,
        `${config.label} sign-in failed`,
        200,
        provider === "google" ? "INVALID_GOOGLE_TOKEN" : "INVALID_FACEBOOK_TOKEN",
      );
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      return errorResponse(res, "Account not found", 200, "USER_NOT_FOUND");
    }
    if (user.role === "admin") {
      return errorResponse(
        res,
        "Admin accounts must sign in with email and password.",
        200,
        "SOCIAL_SIGNIN_NOT_ALLOWED",
      );
    }

    const owner = await prisma.user.findUnique({ where: { [config.idField]: providerId } });
    if (owner && owner.id !== user.id) {
      return errorResponse(
        res,
        `This ${config.label} account is already connected to another KatMitra account.`,
        200,
        "PROVIDER_ALREADY_LINKED",
      );
    }

    const updated =
      user[config.idField] === providerId
        ? user
        : await prisma.user.update({
            where: { id: user.id },
            data: { [config.idField]: providerId },
          });

    logActivity({
      type: `${provider}_linked`,
      message: `${config.label} connected: ${updated.email}`,
      actorUserId: updated.id,
    });

    return successResponse(res, `${config.label} connected`, {
      linked_accounts: linkedAccounts(updated),
    });
  } catch (error) {
    console.error("Link social account error:", error.message);
    if (error.code === "P2002") {
      return errorResponse(
        res,
        "This account is already connected to another KatMitra account.",
        200,
        "PROVIDER_ALREADY_LINKED",
      );
    }
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return errorResponse(res, "No account found for the given email", 404, "USER_NOT_FOUND");
    }

    await prisma.otpCode.deleteMany({
      where: { email, type: "signup" },
    });

    const otp = Math.floor(100000 + 900000 * Math.random()).toString();

    await prisma.otpCode.create({
      data: {
        email,
        otp,
        type: "signup",
        expiresAt: new Date(Date.now() + 120 * 1000),
      },
    });

    sendOtpEmail(email, otp, "signup").catch((emailErr) => {
      console.error("Resend OTP email failed:", emailErr.message);
    });

    return successResponse(res, "OTP resent successfully", null, 200);
  } catch (error) {
    console.error("Resend OTP error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return errorResponse(res, "No account found for the given email", 404, "USER_NOT_FOUND");
    }

    await prisma.otpCode.deleteMany({
      where: { email, type: "forgot" },
    });

    const otp = Math.floor(100000 + 900000 * Math.random()).toString();

    await prisma.otpCode.create({
      data: {
        email,
        otp,
        type: "forgot",
        expiresAt: new Date(Date.now() + 120 * 1000),
      },
    });

    sendOtpEmail(email, otp, "forgot").catch((emailErr) => {
      console.error("Forgot password email failed:", emailErr.message);
    });

    return successResponse(res, "OTP sent to email", null, 200);
  } catch (error) {
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.verifyForgotOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    const existingOtp = await prisma.otpCode.findFirst({
      where: { email, type: "forgot", isUsed: false },
      orderBy: { createdAt: "desc" },
    });

    if (!existingOtp) {
      return errorResponse(res, "OTP is incorrect or has expired", 200, "INVALID_OTP");
    }

    if (new Date() > existingOtp.expiresAt) {
      return errorResponse(res, "OTP is incorrect or has expired", 200, "INVALID_OTP");
    }

    if (existingOtp.otp !== otp) {
      return errorResponse(res, "OTP is incorrect or has expired", 200, "INVALID_OTP");
    }

    await prisma.otpCode.update({
      where: { id: existingOtp.id },
      data: { isUsed: true },
    });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return errorResponse(res, "No account found for the given email", 404, "USER_NOT_FOUND");
    }

    // Short-lived proof that the forgot OTP was verified. Binding it to the
    // current sessionVersion makes it single-use: newPassword bumps the version.
    const resetToken = jwt.sign(
      { userId: user.id, email: user.email, purpose: "reset", sessionVersion: user.sessionVersion },
      process.env.JWT_SECRET,
      { expiresIn: "10m" },
    );

    return successResponse(res, "OTP verified", { resetToken }, 200);
  } catch (error) {
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.resendForgotOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return errorResponse(res, "No account found for the given email", 404, "USER_NOT_FOUND");
    }

    await prisma.otpCode.deleteMany({
      where: {
        email,
        type: "forgot",
      },
    });

    const otp = Math.floor(100000 + 900000 * Math.random()).toString();

    await prisma.otpCode.create({
      data: {
        email,
        otp,
        type: "forgot",
        expiresAt: new Date(Date.now() + 120 * 1000),
      },
    });

    sendOtpEmail(email, otp, "forgot").catch((emailErr) => {
      console.error("Forgot password email failed:", emailErr.message);
    });

    return successResponse(res, "OTP resent successfully", null, 200);
  } catch (error) {
    console.error("Resend forgot OTP error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.newPassword = async (req, res) => {
  try {
    const { email, password, password_confirmation, reset_token } = req.body;

    if (!email || !password || !password_confirmation || !reset_token) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    if (password !== password_confirmation) {
      return errorResponse(
        res,
        "One or more required fields are missing or malformed",
        200,
        "VALIDATION_ERROR",
      );
    }

    if (!validatePassword(password)) {
      return errorResponse(
        res,
        "Password must be 8 characters, include 1 uppercase, 1 number and 1 special character",
        200,
        "VALIDATION_ERROR",
      );
    }

    let resetClaims;
    try {
      resetClaims = jwt.verify(reset_token, process.env.JWT_SECRET);
    } catch {
      resetClaims = null;
    }
    if (!resetClaims || resetClaims.purpose !== "reset" || resetClaims.email !== email) {
      return errorResponse(res, "Reset link is invalid or has expired", 200, "INVALID_RESET_TOKEN");
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      return errorResponse(res, "No account found for the given email", 404, "USER_NOT_FOUND");
    }
    if (existing.id !== resetClaims.userId || existing.sessionVersion !== resetClaims.sessionVersion) {
      return errorResponse(res, "Reset link is invalid or has expired", 200, "INVALID_RESET_TOKEN");
    }

    const hashedPassword = await bcrypt.hash(password, 8);

    await prisma.user.update({
      where: { email },
      data: {
        passwordHash: hashedPassword,
        sessionVersion: { increment: 1 },
        ...(existing.googleId ? { authProvider: "both" } : {}),
      },
    });

    return successResponse(res, "Password reset successfully", null, 200);
  } catch (error) {
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, contact, profile_pic, pdf_prefix, language } = req.body;

    const data = {};
    if (name !== undefined && String(name).trim()) {
      data.name = String(name).trim();
    }
    if (contact !== undefined) {
      const digits = String(contact).replace(/\D/g, "").slice(0, 10);
      data.phoneNumber = digits || null;
    }
    if (profile_pic !== undefined) {
      data.profileImageUrl =
        profile_pic === null || profile_pic === ""
          ? null
          : String(profile_pic).trim();
    }
    if (pdf_prefix !== undefined) {
      const trimmed = String(pdf_prefix).trim();
      if (!validatePdfPrefix(trimmed)) {
        return errorResponse(
          res,
          "PDF prefix must be 2-24 characters and use letters, numbers, - or _",
          200,
          "VALIDATION_ERROR",
        );
      }
      data.pdfPrefix = trimmed;
    }
    if (language !== undefined) {
      const normalized = String(language).trim().toLowerCase();
      if (!SUPPORTED_LANGUAGE_CODES.has(normalized)) {
        return errorResponse(
          res,
          "Unsupported language",
          200,
          "VALIDATION_ERROR",
        );
      }
      data.language = normalized;
    }

    if (Object.keys(data).length === 0) {
      return errorResponse(
        res,
        "No fields to update",
        200,
        "VALIDATION_ERROR",
      );
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
    });

    const business_details = await loadBusinessDetailsArray(updated.businessId);

    // Preserve the current sessionVersion — a profile update is not a new login,
    // so we must not increment it (that would invalidate the caller's own session).
    const token = jwt.sign(
      {
        userId: updated.id,
        businessId: updated.businessId,
        role: updated.role,
        sessionVersion: req.user.sessionVersion,
        // Carry over the caller's expiry so re-issuing never extends an expiring (admin) session.
        ...(req.user.exp ? { exp: req.user.exp } : {}),
      },
      process.env.JWT_SECRET,
      {},
    );

    const formattedUser = formatUserResponse(updated, {
      status: 1,
      user_type: 1,
      device_type: updated.deviceType ?? null,
      device_token: updated.deviceToken ?? null,
      business_details,
    });

    return successResponse(
      res,
      "Profile updated successfully",
      {
        token,
        user: formattedUser,
      },
      200,
    );
  } catch (error) {
    console.error("updateUserProfile error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token =
      authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return errorResponse(res, "Missing or invalid auth token", 401, "UNAUTHORIZED");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    if (!userId) {
      return errorResponse(res, "Missing or invalid auth token", 401, "UNAUTHORIZED");
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return errorResponse(res, "No account found for the given email", 404, "USER_NOT_FOUND");
    }

    const businessId = user.businessId;

    await prisma.$transaction([
      prisma.otpCode.deleteMany({
        where: { email: user.email },
      }),
      prisma.user.delete({
        where: { id: userId },
      }),
    ]);

    if (businessId) {
      const remainingUsers = await prisma.user.count({
        where: { businessId },
      });

      if (remainingUsers === 0) {
        // Delete booking/quotation menu items first (onDelete: Restrict on menuItemId)
        const menuItemIds = (
          await prisma.menuItem.findMany({
            where: { businessId },
            select: { id: true },
          })
        ).map((m) => m.id);

        if (menuItemIds.length > 0) {
          await prisma.bookingMenuItem.deleteMany({
            where: { menuItemId: { in: menuItemIds } },
          });
          await prisma.quotationMenuItem.deleteMany({
            where: { menuItemId: { in: menuItemIds } },
          });
        }

        await prisma.business.delete({ where: { id: businessId } });
      }
    }

    return successResponse(res, "User deleted successfully", null, 200);
  } catch (error) {
    console.error("Delete user error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/**
 * POST /v1/signout  (requires auth)
 *
 * Explicit logout:
 *  1. Increments sessionVersion  → the caller's own JWT is immediately dead,
 *     so even if the token leaks it cannot be reused.
 *  2. Clears deviceToken on the User row → stops push notifications to this device.
 */
exports.signOut = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Single update: increment sessionVersion (invalidates old JWT) and clear
    // the FCM token so this device stops receiving push notifications.
    await prisma.user.update({
      where: { id: userId },
      data: {
        sessionVersion: { increment: 1 },
        deviceToken: null,
        deviceType: null,
      },
    });

    return successResponse(res, "Logged out successfully", null, 200);
  } catch (error) {
    console.error("Sign-out error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/**
 * PATCH /v1/device  (requires auth)
 *
 * Called by the app on cold start and every time it comes to the foreground.
 * Updates the FCM token for this user's device so push notifications stay
 * current without requiring a full sign-out / sign-in cycle.
 *
 * Body: { device_type: number, device_token: string }
 */
exports.updateDevice = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { device_type, device_token } = req.body;

    if (device_type === undefined) {
      return errorResponse(
        res,
        "device_type is required",
        200,
        "VALIDATION_ERROR",
      );
    }

    await setUserDevice(userId, device_type, device_token);

    const notificationStatus = notificationStatusFromDeviceToken(device_token);
    await prisma.user.update({
      where: { id: userId },
      data: { notificationStatus },
    });

    return successResponse(res, "Device updated", null, 200);
  } catch (error) {
    console.error("updateDevice error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

/**
 * PATCH /v1/user/notification  (requires auth)
 *
 * Explicit user preference toggle — does NOT touch the FCM token row,
 * just flips notificationStatus so the backend knows whether to include
 * this user in push broadcasts.
 *
 * Body: { enabled: boolean }
 */
exports.updateNotificationPreference = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      return errorResponse(
        res,
        "enabled must be a boolean",
        200,
        "VALIDATION_ERROR",
      );
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { notificationStatus: enabled ? 1 : 0 },
    });

    return successResponse(
      res,
      enabled ? "Notifications enabled" : "Notifications disabled",
      { notification_status: updated.notificationStatus },
      200,
    );
  } catch (error) {
    console.error("updateNotificationPreference error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.updateNotificationSettings = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { notification_status, device_token } = req.body;

    if (notification_status === undefined && device_token === undefined) {
      return errorResponse(
        res,
        "At least one of notification_status or device_token is required",
        200,
        "VALIDATION_ERROR",
      );
    }

    if (
      notification_status !== undefined &&
      notification_status !== 0 &&
      notification_status !== 1
    ) {
      return errorResponse(
        res,
        "notification_status must be 0 or 1",
        200,
        "VALIDATION_ERROR",
      );
    }

    const data = {};
    if (notification_status !== undefined) data.notificationStatus = notification_status;
    if (device_token !== undefined) data.deviceToken = device_token ?? null;

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
    });

    return successResponse(
      res,
      "Notification settings updated",
      {
        notification_status: updated.notificationStatus,
        device_token: updated.deviceToken,
      },
      200,
    );
  } catch (error) {
    console.error("updateNotificationSettings error:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};

exports.formatBusinessDetail = formatBusinessDetail;
exports.loadBusinessDetailsArray = loadBusinessDetailsArray;
