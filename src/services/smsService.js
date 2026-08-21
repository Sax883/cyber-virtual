const axios = require('axios');

const BASE_URL = 'https://api.smspool.net';

const SERVICE_CODES = {
  WhatsApp: '1012',
  Telegram: '907',
  Facebook: '329',
  Instagram: '457',
  TikTok: '924',
  Snapchat: '846',
};

const COUNTRY_CODES = {
  USA: '1', UK: '2', India: '15', Germany: '24', France: '23', Brazil: '68',
  Ghana: '42', Kenya: '16', 'South Africa': '153', Australia: '159', Japan: '157',
  Italy: '79', Spain: '55', Netherlands: '3', Sweden: '6', Switzerland: '134', Mexico: '53',
  Argentina: '43', Colombia: '39', Indonesia: '9', Malaysia: '20', Philippines: '12', Vietnam: '11',
  Singapore: '141', UAE: '144', 'Saudi Arabia': '35', Egypt: '31', 'New Zealand': '159',
  Turkey: '60', Portugal: '8', Norway: '135', Poland: '21',
};

const formatNumber = (value) => Number(value || 0);

async function requestSmsApi(path, params = {}) {
  const smsApiKey = process.env.SMS_API_KEY || '';
  if (!smsApiKey) throw new Error('SMS_API_KEY is not configured.');
  const body = new URLSearchParams({ key: smsApiKey, ...params });
  const response = await axios.post(`${BASE_URL}${path}`, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return response.data;
}

async function getAvailableServices() {
  return requestSmsApi('/service/retrieve_all');
}

async function getServiceAvailability(serviceName) {
  try {
    const data = await requestSmsApi('/sms/all_stock', { country: COUNTRY_CODES.USA });
    const serviceCode = SERVICE_CODES[serviceName] || String(serviceName).toLowerCase();
    const entries = Array.isArray(data) ? data.flat() : Object.values(data || {}).flat();
    return entries.some((entry) => String(entry.service || entry.service_id || entry.ID) === serviceCode && Number(entry.stock || entry.count || entry.available || 0) > 0);
  } catch (error) {
    return false;
  }
}

async function getPriceForService(serviceName) {
  try {
    const data = await requestSmsApi('/request/price', { country: COUNTRY_CODES.USA, service: SERVICE_CODES[serviceName] });
    const serviceCode = SERVICE_CODES[serviceName] || String(serviceName).toLowerCase();
    if (data && typeof data === 'object') return formatNumber(data.price || data.cost || data.low_price);
    if (typeof data === 'string') return formatNumber(data.match(/[\d.]+/)?.[0]);
  } catch (error) {
    // Fallback gracefully if API or regex fails
  }

  return 8;
}

async function buyNumber({ serviceName, country = '0', avg = 'false', premium = false }) {
  try {
    const serviceId = SERVICE_CODES[serviceName];
    const countryId = COUNTRY_CODES[country];
    if (!serviceId) return { success: false, reason: 'Unsupported service selection.' };
    if (!countryId) return { success: false, reason: 'Unsupported country selection.' };

    const response = await requestSmsApi('/purchase/sms', {
      service: serviceId,
      country: countryId,
      pricing_option: premium ? '1' : '0',
      quantity: '1',
      activation_type: 'SMS',
    });

    const order = Array.isArray(response) ? response[0] : response;
    const activationId = order?.order_code || order?.orderid || order?.order_id || order?.id;
    const phoneNumber = order?.phone_number || order?.phonenumber || order?.phone || order?.number;
    if (activationId && phoneNumber) {

      return {
        success: true,
        activation_id: String(activationId),
        phone_number: String(phoneNumber),
        raw: response,
      };
    }

    return { success: false, reason: order?.message || order?.error || order?.detail || 'No numbers available' };
  } catch (error) {
    return { success: false, reason: error.response?.data?.message || error.response?.data?.error || error.message || 'SMSPool provider is unavailable.' };
  }
}

async function getStatus(activationId) {
  const response = await requestSmsApi('/sms/check', { orderid: activationId });
  return response;
}

async function releaseNumber(activationId) {
  const response = await requestSmsApi('/sms/cancel', { orderid: activationId });
  return response?.success === true || response?.status === true || response?.status === 'success' || response?.message?.toLowerCase?.().includes('cancel');
}

async function getCode(activationId) {
  const response = await requestSmsApi('/sms/check', { orderid: activationId });
  const text = typeof response === 'string' ? response : JSON.stringify(response || {});

  const code = response?.sms || response?.code || response?.full_code || response?.verification_code;
  const receivedMatch = String(code || text).match(/(?:STATUS_OK:|SMS:|"sms":"|"code":"?)([^",}\r\n]+)|^(\d{3,8})$/i);
  if (receivedMatch && (receivedMatch[1] || receivedMatch[2])) {
    const verificationText = (receivedMatch[1] || receivedMatch[2]).trim();
    return {
      status: 'received',
      message: verificationText,
      verificationText,
    };
  }

  if (/STATUS_WAIT|WAIT|pending|"status":1/i.test(text)) {
    return { status: 'waiting', message: 'Waiting for SMS...' };
  }

  return { status: 'pending', message: text || 'Checking activation status...' };
}

module.exports = {
  getAvailableServices,
  getServiceAvailability,
  getPriceForService,
  buyNumber,
  releaseNumber,
  getStatus,
  getCode,
  get SMS_API_KEY() { return process.env.SMS_API_KEY || ''; },
};