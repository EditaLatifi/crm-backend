/**
 * HTML email template for IP3 CRM.
 * Uses inline CSS only for maximum email-client compatibility.
 */

export function wrapInHtmlTemplate(
  subject: string,
  bodyText: string,
  ctaLink?: string,
  ctaLabel?: string,
): string {
  // Convert plain text to HTML paragraphs:
  // - Escape HTML entities
  // - Split on blank lines to create paragraphs
  // - Convert single newlines within paragraphs to <br>
  const escaped = bodyText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const paragraphs = escaped
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p style="margin:0 0 16px 0;line-height:1.6;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n');

  const ctaHtml =
    ctaLink && ctaLabel
      ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
          <tr>
            <td style="border-radius:6px;background-color:#1a1a1a;">
              <a href="${ctaLink}" target="_blank" style="display:inline-block;padding:12px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
                ${ctaLabel}
              </a>
            </td>
          </tr>
        </table>`
      : '';

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f0f0f0;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color:#1a1a1a;padding:20px 32px;">
              <span style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">IP3 CRM</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#333333;">
              ${paragraphs}
              ${ctaHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f8f8;padding:16px 32px;border-top:1px solid #eeeeee;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#999999;text-align:center;">
                IP3 CRM &middot; ip3-crm.ch
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
