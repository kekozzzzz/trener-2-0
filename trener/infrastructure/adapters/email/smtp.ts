import nodemailer from "nodemailer";
import {
  getSmtpHost,
  getSmtpPort,
  getSmtpUser,
  getSmtpPassword,
  getEmailFromAddress,
  getEmailFromName,
  getEmailCallTimeoutMs,
} from "@/config/email";
import type { EmailMessage, EmailPort } from "./types";

// Адаптер поверх обычного почтового ящика (support@whygrid.app, VK WorkSpace/mail.ru)
// вместо отдельного транзакционного сервиса — см. config/email.ts. SMTP (в отличие от
// простого HTTP-запроса к Unisender) требует протокольного клиента: EHLO/STARTTLS/AUTH/
// dot-stuffing руками писать нецелесообразно и рискованно, здесь nodemailer — единственное
// оправданное исключение из стиля «без SDK» этого проекта.
export const smtpEmailAdapter: EmailPort = {
  async sendEmail(message: EmailMessage): Promise<void> {
    const transporter = nodemailer.createTransport({
      host: getSmtpHost(),
      port: getSmtpPort(),
      secure: true, // 465 — SSL с самого начала соединения, без STARTTLS
      auth: { user: getSmtpUser(), pass: getSmtpPassword() },
      connectionTimeout: getEmailCallTimeoutMs(),
      socketTimeout: getEmailCallTimeoutMs(),
    });

    // from — витринный адрес (support@whygrid.app), auth — технический логин ящика;
    // mail.ru принимает несовпадение для писем с подтверждённого домена.
    await transporter.sendMail({
      from: `"${getEmailFromName()}" <${getEmailFromAddress()}>`,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  },
};
