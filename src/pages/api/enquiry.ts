import type { APIRoute } from 'astro';
import nodemailer from 'nodemailer';

export const prerender = false;

const toBool = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();

    const name = String(data?.name ?? '').trim();
    const email = String(data?.email ?? '').trim();
    const phone = String(data?.phone ?? '').trim();
    const enquiry = String(data?.enquiry ?? '').trim();

    if (!name || !email || !enquiry) {
      return new Response(JSON.stringify({ message: 'Name, email and enquiry are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const smtpHost = import.meta.env.SMTP_HOST;
    const smtpPort = Number(import.meta.env.SMTP_PORT ?? '465');
    const smtpSecure = toBool(import.meta.env.SMTP_SECURE, true);
    const smtpUser = import.meta.env.SMTP_USER;
    const smtpPass = String(import.meta.env.SMTP_PASS ?? '').replace(/\s+/g, '');
    const salesEmail =
      import.meta.env.SALES_EMAIL ||
      import.meta.env.ADMIN_MAIL ||
      import.meta.env.CEO_EMAIL ||
      smtpUser;

    if (!smtpHost || !smtpUser || !smtpPass || !salesEmail) {
      return new Response(JSON.stringify({ message: 'Server email settings are incomplete.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // With Gmail SMTP, the authenticated account is the safest sender address.
    const fromEmail = smtpUser;
    const fromName =
      import.meta.env.MAIL_FROM_NAME ||
      import.meta.env.FROM_NAME ||
      'Paperplanes Team';

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.verify();

    await Promise.all([
      transporter.sendMail({
        from: `${fromName} <${fromEmail}>`,
        to: email,
        replyTo: salesEmail,
        subject: 'Thank you for your enquiry',
        text: `Hi ${name},\n\nThank you for contacting us. We have received your enquiry and our team will get back to you soon.\n\nBest regards,\n${fromName}`,
      }),
      transporter.sendMail({
        from: `${fromName} <${fromEmail}>`,
        to: salesEmail,
        replyTo: email,
        subject: `New enquiry from ${name}`,
        text: `New website enquiry:\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone || 'Not provided'}\n\nEnquiry:\n${enquiry}`,
      }),
    ]);

    return new Response(JSON.stringify({ message: 'Enquiry submitted successfully.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Enquiry API error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unable to submit enquiry right now.';

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
