const axios = require('axios');

const BASE_URL = 'https://hero-sms.com/stubs/handler_api.php';
const SERVICE_CODES = { WhatsApp: 'wa', Telegram: 'tg', Facebook: 'fb', Instagram: 'ig', TikTok: 'lf', Snapchat: 'ot' };
const COUNTRY_CODES = {
  USA: '187', UK: '16', Canada: '36', India: '22', Germany: '43', France: '78', Brazil: '73', Ghana: '60', Kenya: '38',
  'South Africa': '31', Australia: '175', Japan: '4', 'South Korea': '51', Italy: '86', Spain: '56', Netherlands: '48', Sweden: '46',
  Switzerland: '9', Mexico: '52', Argentina: '7', Colombia: '33', Indonesia: '6', Malaysia: '7', Philippines: '4', Vietnam: '10',
  Singapore: '196', UAE: '2', 'Saudi Arabia': '11', Egypt: '21', 'New Zealand': '67', Turkey: '62', Portugal: '117', Norway: '74', Poland: '15',
};

const formatNumber = (value) => Number(value || 0);

async function requestSmsApi(action, params = {}) {
  const smsApiKey = process.env.SMS_API_KEY || '';
  if (!smsApiKey) throw new Error('SMS_API_KEY is not configured.');
  const query = new URLSearchParams({ api_key: smsApiKey, action, ...params });
  const response = await axios.get(`${BASE_URL}?${query.toString()}`);
  return response.data;
}

async function getAvailableServices() {
  return Object.entries(SERVICE_CODES).map(([name, ID]) => ({ name, ID }));
}

async function getAvailableCountries() {
  return Object.entries(COUNTRY_CODES).map(([name, ID]) => ({ name, ID }));
}

async function resolveCatalogValue(type, value) {
  const requested = String(value || '').trim();
  const map = type === 'country' ? COUNTRY_CODES : SERVICE_CODES;
  if (Object.values(map).includes(requested)) return requested;
  const match = Object.keys(map).find((name) => name.toLowerCase() === requested.toLowerCase());
  return match ? map[match] : '';
}

async function getServiceAvailability(serviceName) {
  try {
    const serviceCode = await resolveCatalogValue('service', serviceName);
    if (!serviceCode) return false;
    const data = await requestSmsApi('getPrices', { country: COUNTRY_CODES.USA });
    const entries = Array.isArray(data) ? data.flat() : Object.values(data || {}).flat();
    return entries.some((entry) => String(entry.service || entry.service_id || entry.ID) === serviceCode && Number(entry.stock || entry.count || entry.available || 0) > 0);
  } catch (error) {
    return false;
  }
}

async function getPriceForService(serviceName) {
  try {
    const serviceCode = await resolveCatalogValue('service', serviceName);
    if (!serviceCode) return 8;
    const data = await requestSmsApi('getPrices', { country: COUNTRY_CODES.USA });
    if (data && typeof data === 'object') return formatNumber(data.price || data.cost || data.low_price);
    if (typeof data === 'string') return formatNumber(data.match(/[\d.]+/)?.[0]);
  } catch (error) {
    // Fallback gracefully if API or regex fails
  }

  return 8;
}

async function buyNumber({ serviceName, country = '0', avg = 'false', premium = false }) {
  try {
    const [serviceId, countryId] = await Promise.all([
      resolveCatalogValue('service', serviceName),
      resolveCatalogValue('country', country),
    ]);
    if (!serviceId) return { success: false, reason: 'Unsupported service selection.' };
    if (!countryId) return { success: false, reason: 'Unsupported country selection.' };

    const response = await requestSmsApi(premium ? 'getNumberV2' : 'getNumber', {
      service: serviceId,
      country: countryId,
      avg,
      forward: '0',
      operator: '0',
    });

    if (typeof response === 'string' && response.startsWith('ACCESS_NUMBER')) {
      const [, activationId, phoneNumber] = response.split(':');

      return {
        success: true,
        activation_id: String(activationId),
        phone_number: String(phoneNumber),
        raw: response,
      };
    }

    return { success: false, reason: response || 'No numbers available' };
  } catch (error) {
    return { success: false, reason: error.response?.data || error.message || 'Hero-SMS provider is unavailable.' };
  }
}

async function getStatus(activationId) {
  const response = await requestSmsApi('getStatus', { id: activationId });
  return response;
}

async function releaseNumber(activationId) {
  const response = await requestSmsApi('setStatus', { id: activationId, status: '8' });
  return typeof response === 'string' && response.startsWith('ACCESS_CANCEL');
}

async function getCode(activationId) {
  const response = await requestSmsApi('getStatus', { id: activationId });
  const text = typeof response === 'string' ? response : '';

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
  getAvailableCountries,
  getServiceAvailability,
  getPriceForService,
  buyNumber,
  releaseNumber,
  getStatus,
  getCode,
  get SMS_API_KEY() { return process.env.SMS_API_KEY || ''; },
};