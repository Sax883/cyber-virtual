const twilio = require('twilio');

function getTwilioClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID || '', process.env.TWILIO_AUTH_TOKEN || '');
}

async function sendCreditPurchaseWhatsAppNotification({ packageName, amount, userEmail, proofReference = '' }) {
  const client = getTwilioClient();

  const message = `${String.fromCodePoint(0x1f514)} *New Credit Top-Up Initiated*\n${String.fromCodePoint(0x2022)} Client Email: ${userEmail}\n${String.fromCodePoint(0x2022)} Package: ${packageName}\n${String.fromCodePoint(0x2022)} Amount: NGN ${amount}\n${String.fromCodePoint(0x2022)} Payment Reference: ${proofReference || 'Not provided'}\n\nPlease review and approve in the admin dashboard.`;

  try {
    const response = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886',
      to: process.env.TWILIO_WHATSAPP_TO || 'whatsapp:+2348023291356',
      body: message,
    });

    return { success: true, sid: response.sid };
  } catch (error) {
    const sandboxCodes = [21608, 21211, 400];
    if (error && (sandboxCodes.includes(error.code) || String(error.message || '').includes('sandbox'))) {
      return {
        success: false,
        message: 'Twilio sandbox restriction: add the sandbox number to your approved contacts before live WhatsApp delivery.',
      };
    }

    return {
      success: false,
      message: error && error.message ? error.message : 'Notification delivery failed.',
    };
  }
}

module.exports = {
  sendCreditPurchaseWhatsAppNotification,
  get accountSid() { return process.env.TWILIO_ACCOUNT_SID || ''; },
  get authToken() { return process.env.TWILIO_AUTH_TOKEN || ''; },
  get fromNumber() { return process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'; },
  get toNumber() { return process.env.TWILIO_WHATSAPP_TO || 'whatsapp:+2348023291356'; },
};
