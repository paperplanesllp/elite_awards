import type { APIRoute } from 'astro';
import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const prerender = false;

const asText = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const asBool = (value: string | undefined, fallback = true): boolean => {
  if (value === undefined) return fallback;
  const normalized = value.toLowerCase().trim();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

let fileEnvCache: Record<string, string> | null = null;

const parseEnvValue = (rawValue: string): string => {
  const trimmed = rawValue.trim();
  const isQuoted = (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"));
  return isQuoted ? trimmed.slice(1, -1) : trimmed;
};

const loadFileEnv = (): Record<string, string> => {
  if (fileEnvCache) return fileEnvCache;

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(moduleDir, '../../../.env'),
    path.resolve(moduleDir, '../../../../.env'),
    path.resolve(moduleDir, '../../../../../.env'),
  ];

  const seen = new Set<string>();
  const merged: Record<string, string> = {};

  for (const candidate of candidates) {
    if (seen.has(candidate) || !fs.existsSync(candidate)) continue;
    seen.add(candidate);

    try {
      const content = fs.readFileSync(candidate, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex <= 0) continue;

        const key = trimmed.slice(0, separatorIndex).trim();
        const value = parseEnvValue(trimmed.slice(separatorIndex + 1));
        if (key && !(key in merged)) {
          merged[key] = value;
        }
      }
    } catch (readError) {
      console.warn('Failed to read .env file:', candidate, readError);
    }
  }

  fileEnvCache = merged;
  return merged;
};

const normalizeSmtpPassword = (value: string): string => {
  return value.replace(/\s+/g, '');
};

const readEnv = (name: string): string => {
  const nodeValue = process.env[name];
  if (typeof nodeValue === 'string' && nodeValue.trim()) {
    return nodeValue.trim();
  }

  const fileEnvValue = loadFileEnv()[name];
  if (typeof fileEnvValue === 'string' && fileEnvValue.trim()) {
    return fileEnvValue.trim();
  }

  const viteValue = import.meta.env[name as keyof ImportMetaEnv];
  if (typeof viteValue === 'string' && viteValue.trim()) {
    return viteValue.trim();
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
    const smtpPass = normalizeSmtpPassword(readEnv('SMTP_PASS'));

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
