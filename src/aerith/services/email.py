"""SMTP delivery for transactional emails."""

from __future__ import annotations

import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from aerith.config import get_settings


def ensure_mail_delivery_configured() -> None:
    mail = get_settings().mail
    if not mail.host.strip():
        raise RuntimeError("Email delivery is not configured")
    if not mail.from_email.strip():
        raise RuntimeError("Email sender is not configured")


def _verification_subject() -> str:
    return "Your AERITH verification code"


def _verification_text(*, code: str, ttl_minutes: int) -> str:
    return (
        "AERITH email verification\n\n"
        f"Your one-time verification code: {code}\n"
        f"This code expires in {ttl_minutes} minutes.\n\n"
        "If you did not request this code, you can ignore this email."
    )


def _verification_html(*, code: str, ttl_minutes: int) -> str:
    return f"""
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AERITH verification code</title>
  </head>
  <body style="margin:0;padding:0;background:#050506;font-family:Montserrat,Arial,Helvetica,sans-serif;color:#c5c5cc;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#050506;background-image:radial-gradient(ellipse 110% 70% at 50% -20%, rgba(34,211,238,0.14), transparent 60%),radial-gradient(ellipse 80% 60% at 100% 100%, rgba(34,211,238,0.1), transparent 55%),radial-gradient(ellipse 60% 45% at 0% 30%, rgba(34,211,238,0.09), transparent 55%);padding:32px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:rgba(12,12,14,0.94);border:1px solid rgba(63,63,70,0.55);border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 10px 28px;">
                <div style="font-size:11px;letter-spacing:2.4px;color:#8c8c94;text-transform:uppercase;">AERITH</div>
                <h1 style="margin:8px 0 0 0;font-size:22px;line-height:1.25;color:#e4e4e7;font-weight:600;">Email confirmation</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 28px 6px 28px;">
                <p style="margin:0;color:#8c8c94;font-size:14px;line-height:1.5;">
                  Use this one-time code to finish sign up.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 28px 8px 28px;">
                <div style="font-size:34px;letter-spacing:10px;font-weight:700;color:#22d3ee;background:rgba(24,24,27,0.92);border:1px solid rgba(82,82,91,0.75);border-radius:10px;padding:16px 20px;text-align:center;">
                  {code}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:6px 28px 26px 28px;">
                <p style="margin:0;color:#8c8c94;font-size:12px;line-height:1.5;">
                  Expires in {ttl_minutes} minutes.
                </p>
                <p style="margin:8px 0 0 0;color:#71717a;font-size:12px;line-height:1.5;">
                  If you did not request this email, you can safely ignore it.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
""".strip()


def send_verification_code_email(*, to_email: str, code: str, ttl_minutes: int) -> None:
    ensure_mail_delivery_configured()
    mail = get_settings().mail

    msg = EmailMessage()
    msg["Subject"] = _verification_subject()
    msg["From"] = formataddr((mail.from_name, mail.from_email))
    msg["To"] = to_email
    msg.set_content(_verification_text(code=code, ttl_minutes=ttl_minutes))
    msg.add_alternative(_verification_html(code=code, ttl_minutes=ttl_minutes), subtype="html")

    timeout = 15
    if mail.use_ssl:
        with smtplib.SMTP_SSL(mail.host, mail.port, timeout=timeout) as client:
            if mail.username:
                client.login(mail.username, mail.password)
            client.send_message(msg)
        return

    with smtplib.SMTP(mail.host, mail.port, timeout=timeout) as client:
        if mail.use_tls:
            client.starttls()
        if mail.username:
            client.login(mail.username, mail.password)
        client.send_message(msg)
