"""OTP generation, storage, and email delivery for the email+OTP login flow."""
import random
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from db import SCHEMA, execute, query
from gateway.config import SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_USER
from security import AuthError

OTP_EXPIRY_MINUTES = 10
OTP_MAX_ATTEMPTS = 5


def _generate_code() -> str:
    return f"{random.randint(0, 999999):06d}"


def create_otp(email: str) -> str:
    """Invalidate any prior OTP for this email and create a fresh one. Returns the 6-digit code."""
    code = _generate_code()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)
    execute(f"DELETE FROM {SCHEMA}.otp_tokens WHERE email = %s", (email,))
    execute(
        f"INSERT INTO {SCHEMA}.otp_tokens (email, token, expires_at, attempts) VALUES (%s, %s, %s, 0)",
        (email, code, expires_at),
    )
    return code


def verify_otp(email: str, code: str) -> None:
    """Validate the OTP. Raises AuthError on any failure; deletes the token on success."""
    rows = query(
        f"SELECT * FROM {SCHEMA}.otp_tokens WHERE email = %s ORDER BY created_at DESC LIMIT 1",
        (email,),
    )
    if not rows:
        raise AuthError("No sign-in code was sent. Please request a new one.")

    record = rows[0]
    expires_at = record["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if datetime.now(timezone.utc) >= expires_at:
        execute(f"DELETE FROM {SCHEMA}.otp_tokens WHERE email = %s", (email,))
        raise AuthError("Code has expired. Please request a new one.")

    attempts = record["attempts"]
    if attempts >= OTP_MAX_ATTEMPTS:
        execute(f"DELETE FROM {SCHEMA}.otp_tokens WHERE email = %s", (email,))
        raise AuthError("Too many failed attempts. Please request a new code.")

    if record["token"] != code:
        new_attempts = attempts + 1
        if new_attempts >= OTP_MAX_ATTEMPTS:
            execute(f"DELETE FROM {SCHEMA}.otp_tokens WHERE email = %s", (email,))
            raise AuthError("Too many failed attempts. Please request a new code.")
        execute(
            f"UPDATE {SCHEMA}.otp_tokens SET attempts = %s WHERE email = %s",
            (new_attempts, email),
        )
        remaining = OTP_MAX_ATTEMPTS - new_attempts
        label = "attempt" if remaining == 1 else "attempts"
        raise AuthError(f"Incorrect code. {remaining} {label} remaining.")

    execute(f"DELETE FROM {SCHEMA}.otp_tokens WHERE email = %s", (email,))


def send_otp_email(email: str, code: str) -> None:
    """Send the OTP via SMTP. Raises AuthError if credentials are missing or delivery fails."""
    if not SMTP_USER or not SMTP_PASS:
        raise AuthError(
            "Email sending is not configured. Set SMTP_USER and SMTP_PASS.", status=500
        )

    msg = MIMEMultipart()
    msg["From"] = SMTP_USER
    msg["To"] = email
    msg["Subject"] = "Your sign-in code"
    msg.attach(
        MIMEText(
            f"Your sign-in code is: {code}\n\n"
            f"This code expires in {OTP_EXPIRY_MINUTES} minutes.\n"
            "Do not share this code with anyone.",
            "plain",
        )
    )

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, email, msg.as_string())
    except smtplib.SMTPException as exc:
        raise AuthError(f"Failed to send email: {exc}", status=500) from exc
