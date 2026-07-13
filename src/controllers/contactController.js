const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");
const { sendContactInquiryEmail, sendContactConfirmationEmail } = require("../utils/email");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/contact-us
 * Body: { email, customer_name, phone, description }
 * Auth: not required
 */
exports.submitContact = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { email, customer_name, phone, business_name, address, description } = req.body;

    const emailTrim = typeof email === "string" ? email.trim() : "";
    const nameTrim =
      typeof customer_name === "string" ? customer_name.trim() : "";
    const phoneDigits =
      typeof phone === "string" ? phone.replace(/\D/g, "").slice(0, 10) : "";
    const businessNameTrim =
      typeof business_name === "string" ? business_name.trim() : "";
    const addressTrim =
      typeof address === "string" ? address.trim() : "";
    const descTrim =
      typeof description === "string" ? description.trim() : "";

    if (!nameTrim) {
      return errorResponse(
        res,
        "Name is required",
        422,
        "VALIDATION_ERROR",
      );
    }
    if (nameTrim.length < 2) {
      return errorResponse(
        res,
        "Name must be at least 2 characters",
        422,
        "VALIDATION_ERROR",
      );
    }
    if (!phoneDigits) {
      return errorResponse(
        res,
        "Phone number is required",
        422,
        "VALIDATION_ERROR",
      );
    }
    if (phoneDigits.length !== 10) {
      return errorResponse(
        res,
        "Enter a valid 10-digit phone number",
        422,
        "VALIDATION_ERROR",
      );
    }
    if (!businessNameTrim) {
      return errorResponse(
        res,
        "Catering business name is required",
        422,
        "VALIDATION_ERROR",
      );
    }
    if (businessNameTrim.length < 2) {
      return errorResponse(
        res,
        "Catering business name must be at least 2 characters",
        422,
        "VALIDATION_ERROR",
      );
    }
    if (emailTrim && !EMAIL_RE.test(emailTrim)) {
      return errorResponse(
        res,
        "Invalid email address",
        422,
        "VALIDATION_ERROR",
      );
    }

    const createdMessage = await prisma.contactMessage.create({
      data: {
        email: emailTrim || null,
        customerName: nameTrim,
        phone: phoneDigits,
        businessName: businessNameTrim,
        address: addressTrim || null,
        description: descTrim || null,
        userId: userId ?? null,
      },
    });

    // Both emails are fire-and-forget — data is already safe in DB.

    // 1. Notify the Katmitra admin team.
    sendContactInquiryEmail({
      toEmail: "info.katmitra@gmail.com",
      inquiry: {
        email: createdMessage.email,
        customerName: createdMessage.customerName,
        phone: createdMessage.phone,
        businessName: createdMessage.businessName,
        address: createdMessage.address,
        description: createdMessage.description,
        createdAt: createdMessage.createdAt,
      },
    }).catch((err) =>
      console.error("sendContactInquiryEmail failed (non-fatal):", err.message)
    );

    // 2. Send a confirmation to the customer (only if they provided an email).
    if (createdMessage.email) {
      sendContactConfirmationEmail({
        toEmail: createdMessage.email,
        inquiry: {
          customerName: createdMessage.customerName,
          businessName: createdMessage.businessName,
          phone: createdMessage.phone,
        },
      }).catch((err) =>
        console.error("sendContactConfirmationEmail failed (non-fatal):", err.message)
      );
    }

    return successResponse(
      res,
      "Your message has been sent. We'll get back to you soon.",
      null,
      200,
    );
  } catch (error) {
    console.error("submitContact:", error.message);
    return errorResponse(res, "Server error", 500, "ERROR");
  }
};
