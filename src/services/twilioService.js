const twilio = require('twilio');

function getTwilioClient() {
  const missing = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM', 'TWILIO_WHATSAPP_TO']
    .filter((name) => !String(process.env[name] || '').trim());
  if (missing.length) {
    throw new Error(`Missing Twilio production environment variable(s): ${missing.join(', ')}`);
  }
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

async function sendCreditPurchaseWhatsAppNotification({ packageName, amount, userEmail, proofReference = '' }) {
  const client = getTwilioClient();

  const message = `${String.fromCodePoint(0x1f514)} *New Credit Top-Up Initiated*\n${String.fromCodePoint(0x2022)} Client Email: ${userEmail}\n${String.fromCodePoint(0x2022)} Package: ${packageName}\n${String.fromCodePoint(0x2022)} Amount: NGN ${amount}\n${String.fromCodePoint(0x2022)} Payment Reference: ${proofReference || 'Not provided'}\n\nPlease review and approve in the admin dashboard.`;

  const response = await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to: process.env.TWILIO_WHATSAPP_TO,
    body: message,
  });

  return { success: true, sid: response.sid };
}

module.exports = {
  sendCreditPurchaseWhatsAppNotification,
  get accountSid() { return process.env.TWILIO_ACCOUNT_SID || ''; },
  get authToken() { return process.env.TWILIO_AUTH_TOKEN || ''; },
  get fromNumber() { return process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'; },
  get toNumber() { return process.env.TWILIO_WHATSAPP_TO || 'whatsapp:+2348023291356'; },
};
