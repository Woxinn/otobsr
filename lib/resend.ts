const RESEND_API_URL = "https://api.resend.com/emails";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendResendEmail(input: SendEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.DEVICE_APPROVAL_FROM_EMAIL;
  const fromName = process.env.DEVICE_APPROVAL_FROM_NAME?.trim() || "Oto Başar İthalat Takip";

  if (!apiKey || !fromEmail) {
    throw new Error("Resend e-posta ayarları eksik.");
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(payload || "Resend e-posta gönderimi başarısız.");
  }
}

export function buildAdminDeviceRequestEmail(input: {
  approvalUrl: string;
  userEmail: string;
  deviceLabel: string;
  browser: string;
  platform: string;
  requestedAt: string;
  expiresAt: string;
}) {
  const subject = `Cihaz onayı gerekiyor - ${input.userEmail}`;
  const text = [
    `${input.userEmail} hesabı için yeni bir cihaz onay talebi oluştu.`,
    "",
    `Cihaz: ${input.deviceLabel}`,
    `Tarayıcı: ${input.browser}`,
    `Platform: ${input.platform}`,
    `Talep zamanı: ${input.requestedAt}`,
    `Geçerlilik sonu: ${input.expiresAt}`,
    "",
    `Onay ekranı: ${input.approvalUrl}`,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f5f1e8;padding:32px;color:#1f2937">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:24px;padding:32px;border:1px solid rgba(0,0,0,0.08)">
        <p style="font-size:12px;letter-spacing:0.25em;text-transform:uppercase;color:#6b7280;margin:0 0 16px">Cihaz onay talebi</p>
        <h1 style="font-size:28px;line-height:1.2;margin:0 0 16px;color:#111827">Yeni cihaz için yönetici onayı gerekiyor</h1>
        <p style="font-size:15px;line-height:1.7;margin:0 0 20px;color:#374151">
          <strong>${input.userEmail}</strong> hesabı yeni bir cihazdan giriş denemesi yaptı.
          Onay vermek için cihaz yönetimi ekranını açın.
        </p>
        <div style="border:1px solid rgba(0,0,0,0.08);border-radius:18px;padding:16px 18px;background:#faf7f2;margin:0 0 22px">
          <p style="margin:0 0 8px"><strong>Cihaz:</strong> ${input.deviceLabel}</p>
          <p style="margin:0 0 8px"><strong>Tarayıcı:</strong> ${input.browser}</p>
          <p style="margin:0 0 8px"><strong>Platform:</strong> ${input.platform}</p>
          <p style="margin:0 0 8px"><strong>Talep zamanı:</strong> ${input.requestedAt}</p>
          <p style="margin:0"><strong>Geçerlilik sonu:</strong> ${input.expiresAt}</p>
        </div>
        <p style="margin:0 0 28px">
          <a href="${input.approvalUrl}" style="display:inline-block;background:#14525a;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:700">
            Cihaz taleplerini aç
          </a>
        </p>
        <p style="font-size:12px;line-height:1.7;color:#9ca3af;margin:0">
          Bağlantı: <br />
          <a href="${input.approvalUrl}" style="color:#14525a;word-break:break-all">${input.approvalUrl}</a>
        </p>
      </div>
    </div>
  `;

  return { subject, text, html };
}
