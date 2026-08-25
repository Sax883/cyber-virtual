const axios = require('axios');

const DEFAULT_API_URL = 'https://justanotherpanel.com/api/v2';
const SERVICE_IDS = {
  TikTok: 6866,
  Telegram: 6685,
  Instagram: 8751,
  Snapchat: 4165,
  Facebook: 1907,
};
const MARKUPS = {
  Instagram: 3.6,
  default: 1.5,
};
const BASE_NGN_PER_1000 = {
  TikTok: 500,
  Telegram: 500,
  Instagram: 500,
  Snapchat: 500,
  Facebook: 500,
};

function getApiConfig() {
  return {
    url: String(process.env.SMM_API_URL || DEFAULT_API_URL).replace(/\/$/, ''),
    key: String(process.env.SMM_API_KEY || '').trim(),
  };
}

function getServiceId(platform) {
  return SERVICE_IDS[platform] || 0;
}

function getMarkup(platform) {
  return MARKUPS[platform] || MARKUPS.default;
}

function parseServices(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.services)) return payload.services;
  if (payload && typeof payload === 'object') return Object.values(payload).filter((entry) => entry && typeof entry === 'object');
  return [];
}

async function getProviderService(platform) {
  const { url, key } = getApiConfig();
  if (!key) throw new Error('SMM_API_KEY is not configured.');
  const response = await axios.post(url, new URLSearchParams({ key, action: 'services' }).toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000,
  });
  const serviceId = getServiceId(platform);
  const service = parseServices(response.data).find((entry) => Number(entry.service || entry.id) === serviceId);
  if (!service) throw new Error(`JAP service ${serviceId} is unavailable.`);
  const rate = Number(service.rate || service.price || service.cost);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`JAP returned an invalid rate for service ${serviceId}.`);
  return { serviceId, rate, name: service.name || platform };
}

async function getBoostQuote(platform, quantity) {
  let provider;
  try {
    provider = await getProviderService(platform);
  } catch (error) {
    if (!BASE_NGN_PER_1000[platform]) throw error;
    provider = { serviceId: SERVICE_IDS[platform], rate: 0, fallback: true };
  }
  const units = Math.ceil(Number(quantity) / 1000);
  const baseNgn = BASE_NGN_PER_1000[platform];
  const amount = units * baseNgn * getMarkup(platform);
  return {
    amount: Math.ceil(amount),
    baseNgn,
    providerRate: provider.rate,
    serviceId: provider.serviceId,
    markup: getMarkup(platform),
    fallback: Boolean(provider.fallback),
  };
}

async function addBoostOrder({ platform, target, quantity }) {
  const { url, key } = getApiConfig();
  if (!key) throw new Error('SMM_API_KEY is not configured.');
  const serviceId = getServiceId(platform);
  if (!serviceId) throw new Error('Unsupported JAP platform service.');
  const response = await axios.post(url, new URLSearchParams({
    key,
    action: 'add',
    service: String(serviceId),
    link: target,
    quantity: String(quantity),
  }).toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });
  const payload = response.data;
  if (!payload || payload.error || !payload.order) {
    throw new Error(payload?.error || 'JAP did not accept the boost order.');
  }
  return { providerOrderId: String(payload.order), serviceId };
}

async function getBoostOrderStatus(providerOrderId) {
  const { url, key } = getApiConfig();
  if (!key || !providerOrderId) throw new Error('JAP status configuration is incomplete.');
  const response = await axios.post(url, new URLSearchParams({ key, action: 'status', order: String(providerOrderId) }).toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000,
  });
  const payload = response.data || {};
  if (payload.error) throw new Error(payload.error);
  const status = String(payload.status || '').toLowerCase();
  if (!status) throw new Error('JAP returned no campaign status.');
  const normalizedStatus = status.includes('complete') ? 'completed'
    : status.includes('fail') ? 'failed'
      : status.includes('cancel') ? 'cancelled'
        : 'in_progress';
  const remains = Number(payload.remains);
  return { status: normalizedStatus, remains: Number.isFinite(remains) ? remains : null };
}

module.exports = { SERVICE_IDS, getBoostQuote, addBoostOrder, getBoostOrderStatus };
