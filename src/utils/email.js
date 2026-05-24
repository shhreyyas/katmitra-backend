const { Resend } = require("resend");

// ─── Resend HTTP API ──────────────────────────────────────────────────────────
// Uses HTTPS (port 443) — works on Railway where SMTP ports 465/587 are blocked.
// Free tier: 3,000 emails/month, no credit card required.
//
// Required env vars:
//   RESEND_API_KEY     — from resend.com dashboard
//   RESEND_FROM_EMAIL  — verified sender address e.g. noreply@katmitra.com
// ──────────────────────────────────────────────────────────────────────────────
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

async function sendEmail({ fromLabel, to, subject, html }) {
  const { error } = await resend.emails.send({
    from: `${fromLabel} <${FROM_EMAIL}>`,
    to,
    subject,
    html,
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

// ─── Shared header & footer snippets ─────────────────────────────────────────

function emailHeader(subtitle = "") {
  return `
    <tr>
      <td style="background: linear-gradient(135deg, #FF6B35 0%, #F7931E 100%); padding: 0;">
        <!-- Top accent bar -->
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 36px 40px 28px 40px; text-align: center;">
              <!-- Logo text -->
              <div style="display:inline-block; margin-bottom:6px;">
                <span style="font-size:11px; font-weight:700; color:rgba(255,255,255,0.75); letter-spacing:4px; text-transform:uppercase;">🍽️ &nbsp;KATMITRA</span>
              </div>
              <div>
                <span style="font-size:28px; font-weight:800; color:#ffffff; letter-spacing:-0.5px;">Katmitra</span>
              </div>
              ${subtitle ? `<p style="margin:6px 0 0 0; font-size:13px; color:rgba(255,255,255,0.85); font-weight:400; letter-spacing:0.3px;">${subtitle}</p>` : ""}
            </td>
          </tr>
          <!-- Wave separator -->
          <tr>
            <td style="padding:0; line-height:0; font-size:0;">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 30" preserveAspectRatio="none" style="display:block; width:100%; height:30px;">
                <path d="M0,30 C150,0 450,0 600,30 L600,30 L0,30 Z" fill="#ffffff"/>
              </svg>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function emailFooter() {
  const year = new Date().getFullYear();
  return `
    <tr>
      <td style="padding: 0 40px;">
        <div style="border-top: 1px solid #EDF2F7; margin: 0;"></div>
      </td>
    </tr>
    <tr>
      <td style="padding: 24px 40px 32px 40px; text-align: center; background-color: #FAFAFA;">
        <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #FF6B35; letter-spacing: 0.5px;">KATMITRA</p>
        <p style="margin: 0 0 12px 0; font-size: 12px; color: #A0AEC0; line-height: 1.6;">
          Smart Catering Management Platform
        </p>
        <p style="margin: 0; font-size: 11px; color: #CBD5E0; line-height: 1.8;">
          © ${year} Katmitra. All rights reserved.&nbsp;&nbsp;·&nbsp;&nbsp;
          <a href="https://www.katmitra.com/support" style="color: #FF6B35; text-decoration: none; font-weight: 500;">Support</a>&nbsp;&nbsp;·&nbsp;&nbsp;
          <a href="https://www.katmitra.com" style="color: #FF6B35; text-decoration: none; font-weight: 500;">katmitra.com</a>
        </p>
      </td>
    </tr>`;
}

// ─────────────────────────────────────────────────────────────────────────────

exports.sendOtpEmail = async (toEmail, otp, type = "signup") => {
  const isSignup = type === "signup";

  const subject = isSignup
    ? "Verify your Katmitra account"
    : "Reset your Katmitra password";

  const heading = isSignup ? "Verify Your Email" : "Reset Your Password";

  const subheading = isSignup
    ? "Welcome to Katmitra! Please use the OTP below to verify your email address and get started."
    : "We received a request to reset your password. Use the OTP below to continue.";

  const iconBg = isSignup ? "#EBF8FF" : "#FFF5F5";
  const icon = isSignup ? "✉️" : "🔐";

  // Render each OTP digit in its own box
  const otpDigits = String(otp)
    .split("")
    .map(
      (d) =>
        `<td style="padding: 0 4px;">
          <div style="
            width: 44px; height: 56px; line-height: 56px;
            background: #FFF5EC;
            border: 2px solid #FF6B35;
            border-radius: 10px;
            font-size: 28px; font-weight: 800;
            color: #FF6B35;
            text-align: center;
            font-family: 'Courier New', monospace;
          ">${d}</div>
        </td>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject}</title>
</head>
<body style="margin:0; padding:0; background-color:#F7F8FC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F8FC; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); max-width:580px;">

          ${emailHeader("Smart Catering Management")}

          <!-- Icon + Heading -->
          <tr>
            <td style="padding: 40px 40px 0 40px; text-align: center;">
              <div style="
                display: inline-flex; align-items: center; justify-content: center;
                width: 64px; height: 64px; border-radius: 50%;
                background-color: ${iconBg};
                font-size: 28px; margin-bottom: 20px;
              ">${icon}</div>
              <h1 style="margin: 0 0 10px 0; font-size: 24px; font-weight: 700; color: #1A202C; letter-spacing: -0.3px;">${heading}</h1>
              <p style="margin: 0 0 32px 0; font-size: 15px; color: #718096; line-height: 1.7; max-width: 420px; margin-left: auto; margin-right: auto;">${subheading}</p>
            </td>
          </tr>

          <!-- OTP Digits -->
          <tr>
            <td style="padding: 0 40px 8px 40px; text-align: center;">
              <p style="margin: 0 0 16px 0; font-size: 11px; font-weight: 700; color: #A0AEC0; letter-spacing: 3px; text-transform: uppercase;">Your One-Time Password</p>
              <table cellpadding="0" cellspacing="0" style="display: inline-table; margin: 0 auto;">
                <tr>${otpDigits}</tr>
              </table>
            </td>
          </tr>

          <!-- Timer banner -->
          <tr>
            <td style="padding: 24px 40px 8px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #FFFBEB, #FEF3C7); border-radius: 10px; border-left: 4px solid #F59E0B;">
                <tr>
                  <td style="padding: 14px 18px;">
                    <p style="margin: 0; font-size: 13px; color: #92400E; line-height: 1.5;">
                      ⏱️ &nbsp;<strong>Expires in 2 minutes.</strong> Do not share this OTP with anyone — Katmitra will never ask for it.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Security note -->
          <tr>
            <td style="padding: 16px 40px 36px 40px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #CBD5E0; line-height: 1.7;">
                Didn't request this? You can safely ignore this email.<br/>Your account remains secure.
              </p>
            </td>
          </tr>

          ${emailFooter()}

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await sendEmail({ fromLabel: "Katmitra", to: toEmail, subject, html });
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string} toEmail
 * @param {{ bookingCode: string, eventAt: Date | null }} opts
 */
exports.sendBookingConfirmationEmail = async (toEmail, opts) => {
  const code = opts.bookingCode || "";
  let when = "your upcoming event";
  if (opts.eventAt) {
    try {
      when = new Date(opts.eventAt).toLocaleString("en-IN", {
        dateStyle: "long",
        timeStyle: "short",
      });
    } catch {
      when = String(opts.eventAt);
    }
  }

  const subject = `Booking Confirmed — ${code} | Katmitra`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject}</title>
</head>
<body style="margin:0; padding:0; background-color:#F7F8FC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F8FC; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); max-width:580px;">

          ${emailHeader("Smart Catering Management")}

          <!-- Success icon + heading -->
          <tr>
            <td style="padding: 44px 40px 32px 40px; text-align: center;">
              <!-- Green circle check -->
              <div style="
                display: inline-block;
                width: 72px; height: 72px; border-radius: 50%;
                background: linear-gradient(135deg, #48BB78, #38A169);
                font-size: 34px; line-height: 72px;
                margin-bottom: 22px;
                box-shadow: 0 4px 12px rgba(72,187,120,0.35);
              ">✓</div>
              <h1 style="margin: 0 0 8px 0; font-size: 26px; font-weight: 800; color: #1A202C;">Booking Confirmed!</h1>
              <p style="margin: 0 0 32px 0; font-size: 15px; color: #718096; line-height: 1.6;">
                Your catering booking has been successfully placed.<br/>Here are your details:
              </p>

              <!-- Detail cards -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <!-- Booking ID card -->
                  <td width="48%" style="padding: 0 6px 0 0; vertical-align: top;">
                    <div style="background: #FFF5EC; border-radius: 12px; padding: 18px 16px; text-align: center; border: 1px solid #FED7C3;">
                      <p style="margin: 0 0 6px 0; font-size: 10px; font-weight: 700; color: #FF6B35; text-transform: uppercase; letter-spacing: 2px;">Booking ID</p>
                      <p style="margin: 0; font-size: 20px; font-weight: 800; color: #1A202C; font-family: 'Courier New', monospace; letter-spacing: 1px;">${code}</p>
                    </div>
                  </td>
                  <!-- Event date card -->
                  <td width="48%" style="padding: 0 0 0 6px; vertical-align: top;">
                    <div style="background: #F0FFF4; border-radius: 12px; padding: 18px 16px; text-align: center; border: 1px solid #C6F6D5;">
                      <p style="margin: 0 0 6px 0; font-size: 10px; font-weight: 700; color: #38A169; text-transform: uppercase; letter-spacing: 2px;">Event Date</p>
                      <p style="margin: 0; font-size: 14px; font-weight: 700; color: #1A202C; line-height: 1.4;">${when}</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Info note -->
          <tr>
            <td style="padding: 0 40px 36px 40px; text-align: center;">
              <p style="margin: 0; font-size: 13px; color: #A0AEC0; line-height: 1.7;">
                Keep your Booking ID handy — you'll need it to track or manage your booking.<br/>
                Questions? We're here to help at
                <a href="mailto:info.katmitra@gmail.com" style="color: #FF6B35; text-decoration: none; font-weight: 600;">info.katmitra@gmail.com</a>
              </p>
            </td>
          </tr>

          ${emailFooter()}

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await sendEmail({ fromLabel: "Katmitra", to: toEmail, subject, html });
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {{ toEmail: string, inquiry: { email: string, customerName: string, phone: string, description: string, createdAt?: Date|string } }} payload
 */
exports.sendContactInquiryEmail = async ({ toEmail, inquiry }) => {
  const submittedAt = inquiry.createdAt
    ? new Date(inquiry.createdAt).toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" })
    : new Date().toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" });

  const subject = `New Inquiry from ${inquiry.customerName} — Katmitra`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject}</title>
</head>
<body style="margin:0; padding:0; background-color:#F7F8FC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F8FC; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); max-width:600px;">

          ${emailHeader("New Contact Inquiry")}

          <tr>
            <td style="padding: 36px 40px 12px 40px;">
              <!-- Notification badge -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="background: #EBF8FF; border-radius: 20px; padding: 6px 14px;">
                    <span style="font-size: 12px; font-weight: 700; color: #2B6CB0; letter-spacing: 0.5px;">📬 &nbsp;NEW INQUIRY</span>
                  </td>
                </tr>
              </table>

              <h2 style="margin: 0 0 6px 0; font-size: 22px; font-weight: 700; color: #1A202C;">
                ${inquiry.customerName}
              </h2>
              <p style="margin: 0 0 28px 0; font-size: 13px; color: #A0AEC0;">Submitted on ${submittedAt}</p>

              <!-- Contact details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border-radius: 12px; overflow: hidden; border: 1px solid #EDF2F7; margin-bottom: 24px;">
                <tr style="background-color: #F7FAFC;">
                  <td style="padding: 10px 16px; font-size: 11px; font-weight: 700; color: #A0AEC0; text-transform: uppercase; letter-spacing: 1.5px; width: 120px;">Email</td>
                  <td style="padding: 10px 16px; border-left: 1px solid #EDF2F7;">
                    <a href="mailto:${inquiry.email}" style="font-size: 14px; color: #FF6B35; text-decoration: none; font-weight: 600;">${inquiry.email}</a>
                  </td>
                </tr>
                <tr style="background-color: #ffffff; border-top: 1px solid #EDF2F7;">
                  <td style="padding: 10px 16px; font-size: 11px; font-weight: 700; color: #A0AEC0; text-transform: uppercase; letter-spacing: 1.5px;">Phone</td>
                  <td style="padding: 10px 16px; border-left: 1px solid #EDF2F7;">
                    <a href="tel:${inquiry.phone}" style="font-size: 14px; color: #2D3748; text-decoration: none; font-weight: 600;">${inquiry.phone}</a>
                  </td>
                </tr>
              </table>

              <!-- Message -->
              <p style="margin: 0 0 10px 0; font-size: 11px; font-weight: 700; color: #A0AEC0; text-transform: uppercase; letter-spacing: 1.5px;">Message</p>
              <div style="background: #F7FAFC; border-radius: 10px; border: 1px solid #EDF2F7; padding: 18px 20px; margin-bottom: 32px;">
                <p style="margin: 0; font-size: 14px; color: #2D3748; line-height: 1.8; white-space: pre-wrap;">${inquiry.description}</p>
              </div>

              <!-- Reply CTA -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom: 8px;">
                <tr>
                  <td style="background: linear-gradient(135deg, #FF6B35, #F7931E); border-radius: 8px; padding: 0;">
                    <a href="mailto:${inquiry.email}" style="display: inline-block; padding: 13px 28px; font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none; letter-spacing: 0.3px;">
                      Reply to ${inquiry.customerName} →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${emailFooter()}

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await sendEmail({ fromLabel: "Katmitra", to: toEmail, subject, html });
};
