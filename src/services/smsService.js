const axios = require('axios');

const SMS_API_KEY = process.env.SMS_API_KEY || 'sk_C_yMH5p7cTmXFFPhkPSioir8eDxaRAPpLm7IiXdfYzE';
const BASE_URL = 'https://hero-sms.com/stubs/handler_api.php';

const SERVICE_CODES = {
  WhatsApp: 'wa',
  Telegram: 'tg',
  Facebook: 'fb',
  Instagram: 'ig',
  TikTok: 'tt',
  Snapchat: 'ot',
};

const COUNTRY_CODES = {
  USA: '187', UK: '16', Canada: '36', India: '22', Germany: '43', France: '78', Brazil: '73',
  Ghana: '60', Kenya: '38', 'South Africa': '31', Australia: '175', Japan: '4', 'South Korea': '51',
  Italy: '86', Spain: '56', Netherlands: '48', Sweden: '46', Switzerland: '9', Mexico: '52', Argentina: '7',
  Colombia: '33', Indonesia: '6', Malaysia: '7', Philippines: '4', Vietnam: '10', Singapore: '196', UAE: '2',
  'Saudi Arabia': '11', Egypt: '21', 'New Zealand': '67', Turkey: '62', Portugal: '117',
  Norway: '74', Poland: '15',
};

const formatNumber = (value) => Number(value || 0);

async function requestSmsApi(action, params = {}) {
  const query = new URLSearchParams({
    api_key: SMS_API_KEY,
    action,
    ...params,
  });

  const response = await axios.get(`${BASE_URL}?${query.toString()}`);
  return response.data;
}

async function getAvailableServices() {
  const data = await requestSmsApi('getPrices','country=0');
  return data;
}

async function getServiceAvailability(serviceName) {
  try {
    const data = await requestSmsApi('getPrices', { country: COUNTRY_CODES.USA });
    const serviceCode = SERVICE_CODES[serviceName] || String(serviceName).toLowerCase();
    const countryPrices = data && typeof data === 'object' ? Object.values(data)[0] : null;
    if (countryPrices && countryPrices[serviceCode]) {
      return Number(countryPrices[serviceCode].count || 0) > 0;
    }
    const normalized = String(data || '').toLowerCase();
    return normalized.includes(String(serviceName).toLowerCase()) || normalized.includes('ok');
  } catch (error) {
    return false;
  }
}

async function getPriceForService(serviceName) {
  try {
    const data = await requestSmsApi('getPrices', { country: COUNTRY_CODES.USA });
    const serviceCode = SERVICE_CODES[serviceName] || String(serviceName).toLowerCase();
    const countryPrices = data && typeof data === 'object' ? Object.values(data)[0] : null;
    if (countryPrices && countryPrices[serviceCode]) {
      return formatNumber(countryPrices[serviceCode].cost);
    }

    if (typeof data === 'string') {
      const serviceMatch = data.match(new RegExp(`${serviceName}.*?:(\\d+)`, 'i'));
      if (serviceMatch && serviceMatch[1]) {
        return formatNumber(serviceMatch[1]);
      }
    }
  } catch (error) {
    // Fallback gracefully if API or regex fails
  }

  return 8;
}

async function buyNumber({ serviceName, country = '0', avg = 'false', premium = false }) {
  try {
    const action = premium ? 'getNumberV2' : 'getNumber';
    const response = await requestSmsApi(action, {
      service: SERVICE_CODES[serviceName] || String(serviceName).toLowerCase(),
      country: COUNTRY_CODES[country] || country,
      avg,
      forward: 0,
      operator: 0,
    });

    if (typeof response === 'string' && response.startsWith('ACCESS_NUMBER')) {
      const parts = response.split(':');
      const id = parts[1];
      const number = parts[2] || '';

      return {
        success: true,
        activation_id: id,
        phone_number: number,
        raw: response,
      };
    }

    if (typeof response === 'string' && response.startsWith('NO_NUMBERS')) {
      return { success: false, reason: 'No numbers available' };
    }

    return { success: false, reason: response || 'Unable to acquire number' };
  } catch (error) {
    return { success: false, reason: 'HeroSMS provider is unavailable. Please try again shortly.' };
  }
}

async function getStatus(activationId) {
  const response = await requestSmsApi('getStatus', { id: activationId });
  return response;
}

async function getCode(activationId) {
  const response = await requestSmsApi('getStatus', { id: activationId });
  const text = typeof response === 'string' ? response : '';

  if (text.includes('STATUS_OK') || text.includes('STATUS_CANCEL')) {
    const match = text.match(/SMS:([^\r\n]+)/i);
    if (match) {
      return {
        status: 'received',
        message: match[1].trim(),
        verificationText: match[1].trim(),
      };
    }
  }

  if (text.includes('WAIT')) {
    return { status: 'waiting', message: 'Waiting for SMS...' };
  }

  return { status: 'pending', message: text || 'Checking activation status...' };
}

module.exports = {
  getAvailableServices,
  getServiceAvailability,
  getPriceForService,
  buyNumber,
  getStatus,
  getCode,
  SMS_API_KEY,
};