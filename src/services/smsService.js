const axios = require('axios');

const BASE_URL = 'https://api.smspool.net';

const catalogCache = new Map();

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
  return getCatalog('service', '/service/retrieve_all');
}

async function getAvailableCountries() {
  return getCatalog('country', '/country/retrieve_all');
}

function catalogItems(data) {
  if (Array.isArray(data)) return data.flat(Infinity).filter((item) => item && typeof item === 'object');
  const nested = data?.countries || data?.services || data?.data || data?.results;
  if (Array.isArray(nested)) return nested.flat(Infinity).filter((item) => item && typeof item === 'object');
  const source = Object.entries(data || {}).map(([key, value]) => (
    value && typeof value === 'object' ? { ...value, ID: value.ID || value.id || key } : { ID: key, name: value }
  ));
  return source.flatMap((item) => Array.isArray(item) ? item : [item]).filter((item) => item && typeof item === 'object');
}

function catalogId(item) {
  return item.ID || item.id || item.country_id || item.countryID || item.service_id || item.serviceID || item.code;
}

function catalogName(item) {
  return item.name || item.country || item.country_name || item.service || item.service_name || item.title || item.label;
}

async function getCatalog(type, path) {
  const cached = catalogCache.get(type);
  if (cached && cached.expiresAt > Date.now()) return cached.items;
  const items = catalogItems(await requestSmsApi(path));
  catalogCache.set(type, { items, expiresAt: Date.now() + 5 * 60 * 1000 });
  return items;
}

async function resolveCatalogValue(type, value) {
  const requested = String(value || '').trim();
  if (/^\d+$/.test(requested)) return requested;

  const items = type === 'country'
    ? await getAvailableCountries()
    : await getAvailableServices();
  const match = items.find((item) => String(catalogId(item)) === requested)
    || items.find((item) => String(catalogName(item) || '').toLowerCase() === requested.toLowerCase());
  return match ? String(catalogId(match)) : '';
}

async function getServiceAvailability(serviceName) {
  try {
    const serviceCode = await resolveCatalogValue('service', serviceName);
    if (!serviceCode) return false;
    const data = await requestSmsApi('/sms/all_stock');
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
    const data = await requestSmsApi('/request/price', { service: serviceCode });
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
  getAvailableCountries,
  getServiceAvailability,
  getPriceForService,
  buyNumber,
  releaseNumber,
  getStatus,
  getCode,
  get SMS_API_KEY() { return process.env.SMS_API_KEY || ''; },
};