'use strict';

const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('../config/logger');

let transporter = null;

const hasPlaceholderValue = (value = '') => /your_|example\.com|changeme/i.test(String(value).trim());

const hasUsableSmtpConfig = () => (
  config.email.enabled &&
  config.email.user &&
  config.email.pass &&
  !hasPlaceholderValue(config.email.user) &&
  !hasPlaceholderValue(config.email.pass)
);

/**
 * Lazy-initialise and return the Nodemailer transporter.
 * Uses SMTP credentials from config; falls back to Ethereal (fake SMTP)
 * in development when credentials are not provided.
 */
const getTransporter = async () => {
  if (transporter) return transporter;

  if (!hasUsableSmtpConfig()) {
    if (config.isDev) {
      // In dev without SMTP creds, use a no-op transport that just logs
      logger.warn('SMTP disabled or not configured for development — emails will be logged only');
      transporter = {
        sendMail: async (opts) => {
          logger.info('DEV EMAIL (not sent)', {
            to: opts.to,
            from: opts.from,
            subject: opts.subject,
          });
          return { messageId: `dev-${Date.now()}` };
        },
        verify: async () => true,
      };
    } else {
      throw new Error('Email SMTP credentials are not configured');
    }
  } else {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: { user: config.email.user, pass: config.email.pass },
      pool: true,
      maxConnections: 5,
    });
  }

  return transporter;
};

/**
 * Send the contact form email to the support address.
 * Also sends an auto-reply to the user.
 *
 * @param {{ name, email, subject, message }} form
 * @returns {Object} nodemailer info objects { toSupport, toUser }
 */
const sendContactEmail = async ({ name, email, subject, message }) => {
  const transport = await getTransporter();

  // E-mail to support team
  const toSupportInfo = await transport.sendMail({
    from: config.email.from,
    to: config.email.to,
    replyTo: email,
    subject: `[Contact] ${subject} — from ${name}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e0e0e0;border-radius:12px;">
        <h2 style="color:#2e7d32;margin-top:0;">New Contact Form Submission</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;font-weight:bold;color:#555;width:120px;">Name</td><td>${name}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;color:#555;">Email</td><td><a href="mailto:${email}">${email}</a></td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;color:#555;">Subject</td><td>${subject}</td></tr>
        </table>
        <hr style="margin:16px 0;border:none;border-top:1px solid #eee;">
        <p style="font-weight:bold;color:#555;margin-bottom:8px;">Message</p>
        <div style="background:#f9f9f9;border-left:4px solid #2e7d32;padding:12px 16px;border-radius:6px;white-space:pre-wrap;">${message}</div>
        <p style="font-size:0.75rem;color:#aaa;margin-top:24px;">Sent via Farmpilot AI contact form</p>
      </div>
    `,
    text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`,
  });

  // Auto-reply to the user
  const toUserInfo = await transport.sendMail({
    from: config.email.from,
    to: email,
    subject: `We received your message — Farmpilot AI`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e0e0e0;border-radius:12px;">
        <h2 style="color:#2e7d32;margin-top:0;">Thanks for reaching out, ${name}!</h2>
        <p>We've received your message and will get back to you within <strong>24 hours</strong>.</p>
        <div style="background:#f1fff3;border:1px solid #c8e6c9;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="margin:0;font-weight:bold;color:#555;">Your message:</p>
          <p style="margin:8px 0 0;color:#333;">${message}</p>
        </div>
        <p>In the meantime, feel free to explore the <a href="http://localhost:3000/crop-info" style="color:#2e7d32;">Crop Knowledge Base</a>.</p>
        <p style="color:#888;font-size:0.85rem;">— The Farmpilot AI Team</p>
      </div>
    `,
    text: `Thanks ${name}! We received your message and will reply within 24 hours.`,
  });

  return { toSupport: toSupportInfo, toUser: toUserInfo };
};

/**
 * Verify SMTP connection (use in health-check).
 */
const verifyConnection = async () => {
  try {
    if (!hasUsableSmtpConfig()) {
      logger.debug('SMTP verify skipped', {
        enabled: config.email.enabled,
        reason: 'SMTP is disabled or placeholder credentials are configured',
      });
      return null;
    }

    const transport = await getTransporter();
    await transport.verify();
    return true;
  } catch (err) {
    logger.error('SMTP verify failed', { error: err.message });
    return false;
  }
};

/**
 * Send an admin reply to a user's contact query.
 *
 * @param {{ toEmail, toName, originalSubject, originalMessage, replyMessage, adminName }} opts
 */
const sendAdminReply = async ({ toEmail, toName, originalSubject, originalMessage, replyMessage, adminName = 'Support Team' }) => {
  const transport = await getTransporter();

  const info = await transport.sendMail({
    from: config.email.from,
    to: toEmail,
    subject: `Re: ${originalSubject} — Farmpilot AI`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e0e0e0;border-radius:12px;">
        <h2 style="color:#2e7d32;margin-top:0;">Reply from Farmpilot AI Support</h2>
        <p>Hi <strong>${toName}</strong>,</p>
        <div style="background:#f1fff3;border-left:4px solid #2e7d32;padding:14px 18px;border-radius:6px;margin:16px 0;white-space:pre-wrap;">${replyMessage}</div>
        <hr style="margin:20px 0;border:none;border-top:1px solid #eee;">
        <p style="color:#888;font-size:0.82rem;margin-bottom:4px;">Your original message:</p>
        <blockquote style="color:#999;font-size:0.82rem;border-left:3px solid #ddd;padding-left:12px;margin:0 0 20px;">${originalMessage}</blockquote>
        <p style="color:#555;font-size:0.85rem;">— ${adminName}, Farmpilot AI Support</p>
        <p style="font-size:0.75rem;color:#aaa;">If you have further questions, reply directly to this email or visit our <a href="http://localhost:3000/contact" style="color:#2e7d32;">contact page</a>.</p>
      </div>
    `,
    text: `Hi ${toName},\n\n${replyMessage}\n\n---\nYour original message:\n${originalMessage}\n\n— ${adminName}, Farmpilot AI Support`,
  });

  return info;
};

/**
 * Send a notification email (generic, e.g. disease alert).
 */
const sendNotificationEmail = async ({ toEmail, subject, htmlBody, textBody }) => {
  const transport = await getTransporter();
  return transport.sendMail({
    from: config.email.from,
    to: toEmail,
    subject,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e0e0e0;border-radius:12px;">
        ${htmlBody}
        <hr style="margin:20px 0;border:none;border-top:1px solid #eee;">
        <p style="font-size:0.75rem;color:#aaa;">— Farmpilot AI · <a href="http://localhost:3000" style="color:#2e7d32;">Visit platform</a></p>
      </div>
    `,
    text: textBody,
  });
};

module.exports = { sendContactEmail, sendAdminReply, sendNotificationEmail, verifyConnection };
