const Setting = require('../models/Setting');

async function getSetting(key, fallback = '') {
  const record = await Setting.findOne({ key });
  return record ? record.value : fallback;
}

async function setSetting(key, value) {
  const record = await Setting.findOneAndUpdate(
    { key },
    { value, updatedAt: new Date() },
    { upsert: true, new: true }
  );

  return record;
}

async function getOpaySettings() {
  return {
    bank: await getSetting('opay_bank', 'OPay'),
    accountNumber: await getSetting('opay_account_number', '9065781267'),
    accountName: await getSetting('opay_account_name', 'Gods power okpara chibueze'),
  };
}

module.exports = { getSetting, setSetting, getOpaySettings };
