import nodemailer from "nodemailer";

type SendPasswordResetEmailInput = {
  to: string;
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
};

function getMailConfig() {
  const gmailUser = process.env.GMAIL_USER?.trim();
  const gmailAppPassword =
    process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");

  if (!gmailUser || !gmailAppPassword) {
    throw new Error(
      "GMAIL_USER and GMAIL_APP_PASSWORD must be configured",
    );
  }

  return {
    gmailUser,
    gmailAppPassword,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendPasswordResetEmail({
  to,
  name,
  resetUrl,
  expiresInMinutes,
}: SendPasswordResetEmailInput): Promise<void> {
  const { gmailUser, gmailAppPassword } = getMailConfig();

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailAppPassword,
    },
  });

  const safeName = escapeHtml(name);
  const safeResetUrl = escapeHtml(resetUrl);

  await transporter.sendMail({
    from: `"SupportFlow" <${gmailUser}>`,
    to,
    subject: "Reset your SupportFlow password",

    text: [
      `Hello ${name},`,
      "",
      "We received a request to reset your SupportFlow password.",
      "",
      `Reset your password: ${resetUrl}`,
      "",
      `This link expires in ${expiresInMinutes} minutes.`,
      "",
      "If you did not request this password reset, ignore this email.",
    ].join("\n"),

    html: `
      <div style="margin:0;background:#f4f4f5;padding:32px;font-family:Arial,sans-serif;color:#18181b">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;padding:32px">
          <h1 style="margin:0 0 20px;font-size:24px">
            Reset your password
          </h1>

          <p style="font-size:15px;line-height:1.6">
            Hello ${safeName},
          </p>

          <p style="font-size:15px;line-height:1.6">
            We received a request to reset your SupportFlow password.
          </p>

          <div style="margin:28px 0">
            <a
              href="${safeResetUrl}"
              style="display:inline-block;border-radius:10px;background:#18181b;padding:13px 22px;color:#ffffff;text-decoration:none;font-weight:600"
            >
              Reset password
            </a>
          </div>

          <p style="font-size:14px;line-height:1.6;color:#52525b">
            This link expires in ${expiresInMinutes} minutes.
          </p>

          <p style="font-size:14px;line-height:1.6;color:#52525b">
            If you did not request this reset, you can safely ignore this email.
          </p>
        </div>
      </div>
    `,
  });
}