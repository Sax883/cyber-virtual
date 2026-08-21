const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
const apiKey = process.env.TWILIO_API_KEY || '';
const apiSecret = process.env.TWILIO_API_SECRET || '';
const fromNumber = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
const toNumber = 'whatsapp:+2348023291356';

function getTwilioClient() {
  return twilio(apiKey, apiSecret, { accountSid });
}

async function sendCreditPurchaseWhatsAppNotification({ packageName, amount, userEmail, proofReference = '' }) {
  const client = getTwilioClient();

  const message = `${String.fromCodePoint(0x1f514)} *New Credit Top-Up Initiated*\n${String.fromCodePoint(0x2022)} Client Email: ${userEmail}\n${String.fromCodePoint(0x2022)} Package: ${packageName}\n${String.fromCodePoint(0x2022)} Amount: NGN ${amount}\n${String.fromCodePoint(0x2022)} Payment Reference: ${proofReference || 'Not provided'}\n\nPlease review and approve in the admin dashboard.`;

  try {
    const response = await client.messages.create({
      from: fromNumber,
      to: toNumber,
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
  accountSid,
  apiKey,
  apiSecret,
  fromNumber,
  toNumber,
};
