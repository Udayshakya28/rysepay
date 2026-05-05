import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  if (!config.SMTP_HOST) {
    transporter = nodemailer.createTransport({ jsonTransport: true });
    logger.info("smtp not configured — using JSON transport (logs emails to stdout)");
  } else {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const tx = getTransporter();
  const info = await tx.sendMail({
    from: config.SMTP_FROM,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
  logger.info({ messageId: info.messageId, to: opts.to, subject: opts.subject }, "email sent");
}
