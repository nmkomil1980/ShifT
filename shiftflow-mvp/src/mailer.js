import nodemailer from 'nodemailer';

// Base URL of the web app that email action links point to.
export const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
const from = process.env.SMTP_FROM || 'ShiftFlow <no-reply@shiftflow.local>';

// Real SMTP when configured, otherwise a dev transport that does not send
// anything — the message (including any action link) is logged to the console
// so the flows work out of the box without a mail server.
const smtpConfigured = !!process.env.SMTP_HOST;
const transport = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    })
  : nodemailer.createTransport({ jsonTransport: true });

export async function sendMail({ to, subject, text, html }) {
  const info = await transport.sendMail({ from, to, subject, text, html });
  if (!smtpConfigured) {
    console.log(`[mailer:dev] → ${to} | ${subject}\n${text}\n`);
  }
  return info;
}

const shell = (title, bodyHtml) => `
  <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1e2130">
    <h2 style="color:#4f46e5">ShiftFlow</h2>
    <h3>${title}</h3>
    ${bodyHtml}
    <p style="color:#9aa0ae;font-size:12px;margin-top:24px">Если вы не ожидали это письмо, просто проигнорируйте его.</p>
  </div>`;

const button = (href, label) =>
  `<p><a href="${href}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${label}</a></p>
   <p style="color:#6b7180;font-size:13px">или откройте ссылку: <br>${href}</p>`;

export const templates = {
  invite: ({ orgName, link }) => ({
    subject: `Приглашение в ShiftFlow — ${orgName}`,
    text: `Вас пригласили в команду «${orgName}» в ShiftFlow.\nЗадайте пароль и войдите: ${link}`,
    html: shell('Вас пригласили в команду',
      `<p>Вас добавили в команду <b>${orgName}</b>. Задайте пароль, чтобы активировать аккаунт.</p>${button(link, 'Принять приглашение')}`),
  }),
  reset: ({ link }) => ({
    subject: 'Сброс пароля ShiftFlow',
    text: `Вы запросили сброс пароля. Перейдите по ссылке (действует 1 час): ${link}`,
    html: shell('Сброс пароля',
      `<p>Вы запросили сброс пароля. Ссылка действует 1 час.</p>${button(link, 'Задать новый пароль')}`),
  }),
  verify: ({ link }) => ({
    subject: 'Подтверждение почты ShiftFlow',
    text: `Подтвердите адрес электронной почты: ${link}`,
    html: shell('Подтвердите email',
      `<p>Спасибо за регистрацию в ShiftFlow. Подтвердите ваш адрес почты.</p>${button(link, 'Подтвердить email')}`),
  }),
};
