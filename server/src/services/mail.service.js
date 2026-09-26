const nodemailer = require('nodemailer');

exports.configured = () => Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
exports.sendResetCode = async (email, code) => {
  if (!exports.configured()) throw new Error('Email is not configured');
  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s/g, '') },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
  await transport.sendMail({
    from: { name: 'ChitraVerse', address: process.env.GMAIL_USER }, to: email,
    subject: 'Your ChitraVerse password reset code',
    text: `Your ChitraVerse password reset code is ${code}.\n\nIt expires in 10 minutes and can be used only once. If you did not request this, ignore this email. Do not share this code.`,
    disableFileAccess: true, disableUrlAccess: true,
  });
};
