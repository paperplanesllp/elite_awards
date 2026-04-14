import type { APIRoute } from 'astro';
import nodemailer from 'nodemailer';

export const prerender = false;

const asText = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const asBool = (value: string | undefined, fallback = true): boolean => {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
};

const readEnv = (name: string): string => {
  const viteValue = import.meta.env[name as keyof ImportMetaEnv];
  if (typeof viteValue === 'string' && viteValue.trim()) {
    return viteValue.trim();
  }

  const nodeValue = process.env[name];
  if (typeof nodeValue === 'string' && nodeValue.trim()) {
    return nodeValue.trim();
  }

  return '';
};

const normalizeSmtpHost = (host: string): string => {
  const lowerHost = host.toLowerCase();
  if (lowerHost === 'mail.gmail.com') {
    return 'smtp.gmail.com';
  }
  return host;
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();

    const name = asText(body?.name);
    const email = asText(body?.email);
    const phone = asText(body?.phone);
    const enquiry = asText(body?.enquiry);

    if (!name || !email) {
      return new Response(JSON.stringify({ message: 'Name and email are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const smtpHost = normalizeSmtpHost(readEnv('SMTP_HOST'));
    const smtpPort = Number(readEnv('SMTP_PORT') || '465');
    const smtpSecure = asBool(readEnv('SMTP_SECURE') || undefined, true);
    const smtpUser = readEnv('SMTP_USER');
    const smtpPass = readEnv('SMTP_PASS');

    const mailFrom = readEnv('MAIL_FROM') || smtpUser;
    const mailTo =
      readEnv('MAIL_TO') ||
      readEnv('SALES_EMAIL') ||
      smtpUser;

    if (!smtpHost || !smtpUser || !smtpPass || !mailTo) {
      return new Response(JSON.stringify({ message: 'SMTP configuration is incomplete on the server.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      requireTLS: !smtpSecure,
      connectionTimeout: 15000,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.verify();

    const details = enquiry || [
      `Title: ${asText(body?.title)}`,
      `Profile Type: ${asText(body?.profileType)}`,
      `Organisation: ${asText(body?.organisation)}`,
      `Address: ${asText(body?.address)}`,
      `GSTIN: ${asText(body?.gstin) || 'Not provided'}`,
      `Sector: ${asText(body?.sector)}`,
      `Award Category: ${asText(body?.awardCategory)}`,
      `Website: ${asText(body?.website) || 'Not provided'}`,
      `Honorary Doctorate Interest: ${asText(body?.doctorateInterest)}`,
      `Terms Accepted: ${asText(body?.termsAccepted) || 'No'}`,
    ].join('\n');

    await transporter.sendMail({
      from: mailFrom,
      to: mailTo,
      replyTo: email,
      subject: `New nomination from ${name}`,
      text: [
        `Name: ${name}`,
        `Email: ${email}`,
        `Phone: ${phone || 'Not provided'}`,
        '',
        details,
      ].join('\n'),
    });

    try {
      await transporter.sendMail({
        from: mailFrom,
        to: email,
        replyTo: mailTo,
        subject: 'Nomination received',
        text: [
          `Hi ${name},`,
          '',
          'Thank you for your nomination. We have received your details and our team will contact you shortly.',
          '',
          'Regards,',
          'Elite Achievers Awards Team',
        ].join('\n'),
      });
    } catch (replyError) {
      console.warn('Nomination acknowledgement email failed:', replyError);
    }

    return new Response(JSON.stringify({ message: 'Nomination submitted successfully.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Nomination API error:', error);

    return new Response(JSON.stringify({ message: 'Unable to submit nomination right now.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
