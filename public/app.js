document.addEventListener('DOMContentLoaded', () => {
  const bottomNav = document.querySelector('.bottom-nav');
  if (!bottomNav || window.getComputedStyle(bottomNav).display === 'none') {
    document.body.classList.remove('pb-24');
  }

  const defaultOpaySettings = {
    bank: 'OPay',
    accountNumber: '9065781267',
    accountName: 'Gods power okpara chibueze',
  };
  const opayScript = document.getElementById('opaySettingsJson');
  const parsedOpaySettings = opayScript ? (() => {
    try {
      return JSON.parse(opayScript.textContent || '{}');
    } catch (error) {
      return {};
    }
  })() : {};
  const opaySettings = { ...defaultOpaySettings, ...parsedOpaySettings };

  const serviceSearch = document.getElementById('serviceSearch');
  const serviceOptions = document.getElementById('serviceOptions');
  const serviceRows = serviceOptions?.querySelectorAll('.service-option') || [];
  const serviceEmptyState = document.getElementById('serviceEmptyState');
  const selectedServiceLabel = document.getElementById('selectedServiceLabel');
  const countryRegionPanel = document.getElementById('countryRegionPanel');
  const menuToggle = document.getElementById('menuToggle');
  const menuClose = document.getElementById('menuClose');
  const menuPanel = document.getElementById('menuPanel');
  const countrySelect = document.getElementById('countrySelect');
  const countrySearch = document.getElementById('countrySearch');
  const serviceInput = document.getElementById('serviceName');
  const orderBtn = document.getElementById('orderBtn');
  const premiumCheckbox = document.getElementById('premiumMode');
  const orderResult = document.getElementById('orderResult');
  const pricingSummary = document.getElementById('pricingSummary');
  const checkoutModal = document.getElementById('checkoutModal');
  const checkoutPackage = document.getElementById('checkoutPackage');
  const checkoutAmount = document.getElementById('checkoutAmount');
  const proofReference = document.getElementById('proofReference');
  const closeCheckoutModal = document.getElementById('closeCheckoutModal');
  const submitPaymentRequest = document.getElementById('submitPaymentRequest');
  const checkoutFormContent = document.getElementById('checkoutFormContent');
  const paymentPendingState = document.getElementById('paymentPendingState');
  const closePendingPayment = document.getElementById('closePendingPayment');
  const workflowNotice = document.getElementById('workflowNotice');
  let selectedCountry = '';
  let selectedCredits = 1;
  let selectedAmount = 0;
  let selectedPackageName = '1 Credit';
  let paymentSubmitted = false;

  const setMenuOpen = (isOpen) => {
    menuPanel?.classList.toggle('open', isOpen);
    menuPanel?.setAttribute('aria-hidden', String(!isOpen));
  };

  menuToggle?.addEventListener('click', () => setMenuOpen(true));
  menuClose?.addEventListener('click', () => setMenuOpen(false));
  menuPanel?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setMenuOpen(false));
  });

  const getErrorMessage = (error, fallback = 'Something went wrong.') => {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string' && error.trim()) return error;
    if (error && typeof error === 'object') {
      if (typeof error.message === 'string' && error.message.trim()) return error.message;
      if (typeof error.error === 'string' && error.error.trim()) return error.error;
      if (error.response?.data) return getErrorMessage(error.response.data, fallback);
      try {
        const serialized = JSON.stringify(error);
        if (serialized && serialized !== '{}') return serialized;
      } catch (serializationError) {
        return fallback;
      }
    }
    return fallback;
  };

  const showNotice = (message, tone = 'success') => {
    if (!workflowNotice) return;
    workflowNotice.textContent = getErrorMessage(message);
    workflowNotice.className = `fixed right-4 top-4 z-[60] max-w-sm rounded-2xl border p-4 text-sm shadow-2xl ${tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-white text-slate-700'}`;
    window.setTimeout(() => workflowNotice.classList.add('hidden'), 5000);
  };

  const copyText = async (value, message) => {
    try {
      await navigator.clipboard.writeText(value);
      showNotice(message);
    } catch (error) {
      showNotice('Copy failed. Please copy the value manually.', 'error');
    }
  };

  const boostResult = (element, message, isError = false) => {
    if (!element) return;
    element.className = `mt-4 rounded-2xl border p-3 text-sm ${isError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`;
    element.textContent = message;
  };

  const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

  const formatNaira = (amount) => `₦${Number(amount || 0).toLocaleString()}`;
  const quoteRequestVersions = {};
  const updateBoostQuote = async (prefix) => {
    const platform = document.getElementById(`${prefix}Platform`)?.value;
    const service = document.getElementById(`${prefix}Service`)?.value;
    const quantity = document.getElementById(`${prefix}Quantity`)?.value;
    const requestVersion = (quoteRequestVersions[prefix] || 0) + 1;
    quoteRequestVersions[prefix] = requestVersion;
    let quote = { amount: 0, credits: 0 };
    const price = document.getElementById(`${prefix}Price`);
    if (price && platform && service && quantity) price.textContent = 'Updating...';
    if (platform && quantity) {
      try {
        const response = await fetch(`/api/boost/quote?platform=${encodeURIComponent(platform)}&service=${encodeURIComponent(service)}&quantity=${encodeURIComponent(quantity)}`, { cache: 'no-store' });
        if (response.ok) quote = await response.json();
      } catch (error) {
        console.debug('Boost quote unavailable');
      }
    }
    if (quoteRequestVersions[prefix] !== requestVersion) return quote;
    const credits = document.getElementById(`${prefix}Credits`);
    if (price) price.textContent = formatNaira(quote.amount);
    if (credits) credits.textContent = quote.amount ? `(${quote.credits} credit${quote.credits === 1 ? '' : 's'} when paying from balance)` : '';
    return quote;
  };

  const submitBoost = async ({ endpoint, platform, service, target, quantity, email = '', paymentReference = '', proofOfPayment = '' }) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, service, target, quantity, email, paymentReference, proofOfPayment }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'Unable to submit boost campaign.');
    return payload;
  };

  const readProofOfPayment = (input) => new Promise((resolve, reject) => {
    const file = input?.files?.[0];
    if (!file) return resolve('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      return reject(new Error('Proof of payment must be a PNG, JPG, or WebP image under 5 MB.'));
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read proof of payment.'));
    return reader.readAsDataURL(file);
  });

  const showBoostSuccess = () => {
    const modal = document.getElementById('boostSuccessModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  };

  const clearBoostInput = (id) => {
    const input = document.getElementById(id);
    if (input) input.value = '';
  };

  document.getElementById('boostSuccessOk')?.addEventListener('click', () => {
    const modal = document.getElementById('boostSuccessModal');
    const guestForm = document.getElementById('guestBoostForm');
    const clientForm = document.getElementById('boostOrderForm');
    guestForm?.reset();
    clientForm?.reset();
    document.getElementById('guestBoostPayment')?.classList.add('hidden');
    document.getElementById('manualBoostPayment')?.classList.add('hidden');
    clearBoostInput('guestPaymentReference');
    clearBoostInput('guestProofOfPayment');
    clearBoostInput('boostPaymentReference');
    clearBoostInput('boostProofOfPayment');
    document.getElementById('guestPaymentSubmit')?.removeAttribute('disabled');
    document.getElementById('manualBoostSubmit')?.removeAttribute('disabled');
    modal?.classList.add('hidden');
    modal?.classList.remove('flex');
    (guestForm || clientForm)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  ['guestBoostPlatform', 'guestBoostService', 'guestBoostQuantity'].forEach((id) => ['input', 'change'].forEach((eventName) => document.getElementById(id)?.addEventListener(eventName, () => updateBoostQuote('guestBoost'))));
  ['boostPlatform', 'boostService', 'boostQuantity'].forEach((id) => ['input', 'change'].forEach((eventName) => document.getElementById(id)?.addEventListener(eventName, () => updateBoostQuote('boost'))));
  updateBoostQuote('guestBoost');
  updateBoostQuote('boost');

  let guestBoostDetails = null;
  document.getElementById('guestBoostForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    guestBoostDetails = {
      platform: document.getElementById('guestBoostPlatform').value,
      service: document.getElementById('guestBoostService').value,
      target: document.getElementById('guestBoostTarget').value.trim(),
      quantity: Number(document.getElementById('guestBoostQuantity').value),
      email: document.getElementById('guestBoostEmail').value.trim(),
    };
    const result = document.getElementById('guestBoostResult');
    const quote = await updateBoostQuote('guestBoost');
    document.getElementById('guestPaymentAmount').textContent = formatNaira(quote.amount);
    document.getElementById('guestBoostPayment').classList.remove('hidden');
    result.classList.add('hidden');
    document.getElementById('guestBoostPayment').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  document.getElementById('guestPaymentSubmit')?.addEventListener('click', async () => {
    try {
      const proofOfPayment = await readProofOfPayment(document.getElementById('guestProofOfPayment'));
      const payload = await submitBoost({ ...guestBoostDetails, endpoint: '/api/boost/guest', paymentReference: document.getElementById('guestPaymentReference').value.trim(), proofOfPayment });
      document.getElementById('guestPaymentSubmit').disabled = true;
      showBoostSuccess();
    } catch (error) {
      showNotice(getErrorMessage(error), 'error');
    }
  });

  const renderBoostOrders = (orders) => {
    const container = document.getElementById('boostOrders');
    if (!container) return;
    if (!orders.length) {
      container.innerHTML = '<p class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">No campaigns yet.</p>';
      return;
    }
    container.innerHTML = orders.map((order) => `<article class="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div class="flex flex-wrap items-center justify-between gap-2"><div><p class="font-semibold text-slate-900">${escapeHtml(order.platform)} ${escapeHtml(order.service)}</p><p class="mt-1 text-xs text-slate-500">${escapeHtml(order.target)} · ${Number(order.quantity).toLocaleString()} units</p></div><span class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">${escapeHtml(order.status.replace('_', ' '))}</span></div><div class="mt-3 flex items-center justify-between text-sm text-slate-700"><span>Progress</span><strong>${Number(order.delivered || 0).toLocaleString()} / ${Number(order.quantity).toLocaleString()}</strong></div><p class="mt-2 text-xs text-slate-500">${order.credits} credit${order.credits === 1 ? '' : 's'} · ${new Date(order.createdAt).toLocaleString()}</p></article>`).join('');
  };

  const loadBoostOrders = async () => {
    const container = document.getElementById('boostOrders');
    if (!container) return;
    try {
      const response = await fetch('/api/boost/orders', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Unable to load campaigns.');
      if (!Array.isArray(payload)) throw new Error('Unable to load campaigns.');
      renderBoostOrders(payload);
    } catch (error) {
      container.innerHTML = `<p class="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">${getErrorMessage(error)}</p>`;
    }
  };

  document.getElementById('boostOrderForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const payload = await submitBoost({ endpoint: '/api/boost/orders', platform: document.getElementById('boostPlatform').value, service: document.getElementById('boostService').value, target: document.getElementById('boostTarget').value.trim(), quantity: Number(document.getElementById('boostQuantity').value) });
      showNotice(`${payload.message} ${payload.balance} credits remaining.`);
      event.target.reset();
      loadBoostOrders();
      document.querySelector('[data-credit-balance]')?.replaceChildren(document.createTextNode(payload.balance));
    } catch (error) {
      showNotice(getErrorMessage(error), 'error');
    }
  });
  document.getElementById('refreshBoostOrders')?.addEventListener('click', loadBoostOrders);
  if (document.getElementById('boostOrders')) loadBoostOrders();
  if (document.getElementById('boostOrders')) window.setInterval(loadBoostOrders, 10000);

  document.getElementById('manualBoostToggle')?.addEventListener('click', () => document.getElementById('manualBoostPayment')?.classList.toggle('hidden'));
  document.getElementById('manualBoostToggle')?.addEventListener('click', () => {
    updateBoostQuote('boost').then((quote) => { document.getElementById('manualBoostAmount').textContent = formatNaira(quote.amount); });
  });
  document.getElementById('manualBoostSubmit')?.addEventListener('click', async () => {
    try {
      const proofOfPayment = await readProofOfPayment(document.getElementById('boostProofOfPayment'));
      const payload = await submitBoost({ endpoint: '/api/boost/orders/manual', platform: document.getElementById('boostPlatform').value, service: document.getElementById('boostService').value, target: document.getElementById('boostTarget').value.trim(), quantity: Number(document.getElementById('boostQuantity').value), paymentReference: document.getElementById('boostPaymentReference').value.trim(), proofOfPayment });
      document.getElementById('manualBoostSubmit').disabled = true;
      loadBoostOrders();
      showBoostSuccess();
    } catch (error) {
      showNotice(getErrorMessage(error), 'error');
    }
  });

  const bindAdminBoostStatus = () => {
    document.querySelectorAll('.admin-boost-status').forEach((select) => {
      select.onchange = async () => {
        await fetch(`/api/boost/admin/orders/${select.dataset.boostId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: select.value }) });
      };
    });
  };
  const bindAdminBoostConfirm = () => {
    document.querySelectorAll('.confirm-boost-btn').forEach((button) => {
      button.onclick = async () => {
        button.disabled = true;
        try {
          const response = await fetch(`/api/boost/admin/orders/${button.dataset.boostId}/confirm`, { method: 'POST' });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.message || 'Unable to trigger JAP campaign.');
          showNotice(payload.message || 'Payment confirmed and JAP campaign triggered.');
          loadAdminBoostOrders();
        } catch (error) {
          showNotice(getErrorMessage(error), 'error');
          button.disabled = false;
        }
      };
    });
  };
  const loadAdminBoostOrders = async () => {
    const container = document.getElementById('adminBoostOrders');
    if (!container) return;
    const response = await fetch('/api/boost/admin/orders', { cache: 'no-store' });
    if (!response.ok) return;
    const orders = await response.json();
    container.innerHTML = orders.length ? `<table class="min-w-full text-left text-sm"><thead><tr class="border-b border-slate-200 text-slate-600"><th class="py-3 pr-4">Client</th><th class="py-3 pr-4">Platform / service</th><th class="py-3 pr-4">Target / quantity</th><th class="py-3 pr-4">Total</th><th class="py-3 pr-4">Reference</th><th class="py-3 pr-4">Proof</th><th class="py-3 pr-4">Status</th><th class="py-3 pr-4">Actions</th></tr></thead><tbody>${orders.map((order) => `<tr class="admin-boost-order border-b border-slate-100" data-boost-id="${escapeHtml(order._id)}"><td class="py-3 pr-4">${escapeHtml(order.user_id?.email || order.guestEmail || 'Guest checkout')}</td><td class="py-3 pr-4">${escapeHtml(order.platform)}<br><span class="text-xs text-slate-500">${escapeHtml(order.service)}</span></td><td class="py-3 pr-4">${escapeHtml(order.target)}<br><span class="text-xs text-slate-500">${Number(order.quantity).toLocaleString()} units</span></td><td class="py-3 pr-4">₦${Number(order.amount || 0).toLocaleString()}</td><td class="py-3 pr-4">${escapeHtml(order.paymentReference || 'None')}</td><td class="py-3 pr-4">${order.proofOfPayment ? `<a href="${escapeHtml(order.proofOfPayment)}" target="_blank" rel="noreferrer" class="text-emerald-700 underline">View proof</a>` : '<span class="text-slate-500">None</span>'}</td><td class="py-3 pr-4"><span data-boost-status class="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">${escapeHtml(order.status.replace('_', ' '))}</span><br><span class="text-xs text-slate-500">${Number(order.delivered || 0).toLocaleString()} / ${Number(order.quantity).toLocaleString()}</span></td><td class="py-3 pr-4"><div class="flex flex-wrap gap-2"><button type="button" class="confirm-boost-btn rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white" data-boost-id="${escapeHtml(order._id)}">Confirm &amp; Trigger JAP</button><button type="button" class="admin-boost-action rounded-xl bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-700" data-boost-id="${escapeHtml(order._id)}" data-status="pending_payment">Keep Pending</button><button type="button" class="admin-boost-action rounded-xl bg-sky-100 px-3 py-2 text-xs font-semibold text-sky-700" data-boost-id="${escapeHtml(order._id)}" data-status="queued">Queue</button><button type="button" class="admin-boost-action rounded-xl bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-700" data-boost-id="${escapeHtml(order._id)}" data-status="failed">Mark Failed</button><button type="button" class="delete-admin-boost rounded-xl bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700" data-boost-id="${escapeHtml(order._id)}">Delete</button></div></td></tr>`).join('')}</tbody></table>` : '<p class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No boost campaigns yet.</p>';
    bindAdminBoostStatus();
    bindAdminBoostConfirm();
    document.querySelectorAll('.admin-boost-action').forEach((button) => {
      button.onclick = async () => {
        const response = await fetch(`/api/boost/admin/orders/${button.dataset.boostId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: button.dataset.status }) });
        if (!response.ok) return showNotice('Unable to update boost request.', 'error');
        loadAdminBoostOrders();
      };
    });
    document.querySelectorAll('.delete-admin-boost').forEach((button) => {
      button.onclick = async () => {
        const response = await fetch(`/api/boost/admin/orders/${button.dataset.boostId}`, { method: 'DELETE' });
        if (!response.ok) return showNotice('Unable to delete boost request.', 'error');
        loadAdminBoostOrders();
      };
    });
  };
  bindAdminBoostStatus();
  bindAdminBoostConfirm();
  const adminBoostContainer = document.getElementById('adminBoostOrders');
  adminBoostContainer?.addEventListener('click', async (event) => {
    const button = event.target.closest('.admin-boost-action, .delete-admin-boost');
    if (!button || button.onclick) return;
    try {
      const method = button.classList.contains('delete-admin-boost') ? 'DELETE' : 'PATCH';
      const options = { method };
      if (method === 'PATCH') {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify({ status: button.dataset.status });
      }
      const response = await fetch(`/api/boost/admin/orders/${button.dataset.boostId}`, options);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Unable to update boost request.');
      showNotice(payload.message || 'Boost request updated.');
      loadAdminBoostOrders();
    } catch (error) {
      showNotice(getErrorMessage(error), 'error');
    }
  });
  document.getElementById('refreshAdminBoosts')?.addEventListener('click', loadAdminBoostOrders);
  if (adminBoostContainer) loadAdminBoostOrders();
  if (document.getElementById('adminBoostOrders')) window.setInterval(loadAdminBoostOrders, 10000);

  const hydrateOpayDetails = () => {
    const bankEl = document.querySelector('[data-opay-field="bank"]');
    const accountNumberEl = document.querySelector('[data-opay-field="accountNumber"]');
    const accountNameEl = document.querySelector('[data-opay-field="accountName"]');

    if (bankEl) bankEl.textContent = opaySettings.bank;
    if (accountNumberEl) accountNumberEl.textContent = opaySettings.accountNumber;
    if (accountNameEl) accountNameEl.textContent = opaySettings.accountName;
  };

  const setCountryState = (country) => {
    if (!country || !pricingSummary || !premiumCheckbox) return;
    selectedCountry = country;

    if (!country) return;
    if (premiumCheckbox) {
      pricingSummary.textContent = `${country}: Standard 8 credits • Premium 15 credits`;
      premiumCheckbox.disabled = false;
      premiumCheckbox.checked = false;
    }
  };

  const selectService = (row) => {
    if (document.getElementById('adminBoostOrders')) loadAdminBoostOrders();
    serviceRows.forEach((serviceRow) => serviceRow.classList.remove('bg-emerald-50', 'text-emerald-700'));
    row.classList.add('bg-emerald-50', 'text-emerald-700');
    serviceSearch.value = row.dataset.serviceName;
    serviceInput.value = row.dataset.serviceId;
    if (selectedServiceLabel) selectedServiceLabel.textContent = row.dataset.serviceName;
    countryRegionPanel?.classList.remove('hidden');
    countryRegionPanel?.scrollIntoView({ behavior: 'smooth' });
    orderBtn?.removeAttribute('disabled');
    if (!selectedCountry && countrySelect) {
      setCountryState(countrySelect.value);
    }
  };

  serviceRows.forEach((row) => row.addEventListener('click', () => selectService(row)));
  serviceSearch?.addEventListener('input', () => {
    const searchTerm = serviceSearch.value.trim().toLowerCase();
    let visibleCount = 0;
    serviceRows.forEach((row) => {
      const isVisible = row.dataset.serviceName.toLowerCase().includes(searchTerm);
      row.classList.toggle('hidden', !isVisible);
      if (isVisible) visibleCount += 1;
    });
    serviceEmptyState?.classList.toggle('hidden', visibleCount > 0);
    const exactMatch = Array.from(serviceRows).find((row) => row.dataset.serviceName.toLowerCase() === searchTerm);
    if (exactMatch) {
      selectService(exactMatch);
    } else if (!searchTerm) {
      serviceInput.value = '';
      if (selectedServiceLabel) selectedServiceLabel.textContent = 'Select a service first';
      orderBtn?.setAttribute('disabled', 'disabled');
    }
  });

  countrySelect?.addEventListener('change', () => setCountryState(countrySelect.value));
  countrySearch?.addEventListener('input', () => {
    const searchTerm = countrySearch.value.trim().toLowerCase();
    Array.from(countrySelect.options).forEach((option) => {
      option.hidden = searchTerm && !option.textContent.toLowerCase().includes(searchTerm);
    });
    const visibleOption = Array.from(countrySelect.options).find((option) => !option.hidden);
    if (visibleOption && (countrySelect.value === '' || countrySelect.selectedOptions[0]?.hidden)) {
      countrySelect.value = visibleOption.value;
      setCountryState(visibleOption.value);
    }
  });
  hydrateOpayDetails();

  orderBtn?.addEventListener('click', async () => {
    const serviceName = serviceInput.value.trim();
    const premium = premiumCheckbox.checked;
    const country = selectedCountry || countrySelect?.value;

    if (!serviceName || !country) {
      window.alert('Select a service and region before requesting a number.');
      return;
    }

    try {
      const response = await fetch('/api/request-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: serviceName, country, premium })
      });

      const text = await response.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch (e) {
        throw new Error(`Server returned non-JSON response: ${text || 'Empty response'}`);
      }

      if (!response.ok) {
        throw new Error(payload.error || payload.message || 'Unable to request number.');
      }

      showNotice(`Number assigned: ${payload.phoneNumber}. Open Active Numbers to monitor codes.`);
      window.setTimeout(() => { window.location.href = '/dashboard/numbers'; }, 900);
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to request number.');
      showNotice(message, 'error');
    }
  });

  const packageMap = {
    1: { amount: 1000, label: '1 Credit' },
    5: { amount: 3000, label: '5 Credits' },
    10: { amount: 5000, label: '10 Credits' },
  };

  const maskNumber = (phoneNumber = '') => {
    if (!phoneNumber) return '—';
    const clean = String(phoneNumber).trim();
    if (clean.length <= 6) return clean;
    const visible = Math.max(4, Math.ceil(clean.length / 2));
    return `${clean.slice(0, visible).replace(/\d/g, 'x')}${clean.slice(visible)}`.replace(/x/g, 'x');
  };

  document.querySelectorAll('.purchase-btn').forEach((button) => {
    button.addEventListener('click', () => {
      selectedCredits = Number(button.dataset.credits);
      selectedPackageName = button.dataset.packageName || packageMap[selectedCredits]?.label || 'Credit package';
      selectedAmount = Number(button.dataset.amount || packageMap[selectedCredits]?.amount || 0);
      checkoutPackage.value = selectedPackageName;
      checkoutAmount.value = `₦${selectedAmount.toLocaleString()}`;
      proofReference.value = '';
      paymentSubmitted = false;
      checkoutFormContent?.classList.remove('hidden');
      paymentPendingState?.classList.add('hidden');
      checkoutModal.classList.remove('hidden');
      checkoutModal.classList.add('flex');
      setTimeout(() => proofReference.focus(), 50);
    });
  });

  closeCheckoutModal?.addEventListener('click', () => {
    if (paymentSubmitted) {
      window.location.href = '/dashboard/purchases';
      return;
    }
    checkoutModal.classList.add('hidden');
    checkoutModal.classList.remove('flex');
  });

  closePendingPayment?.addEventListener('click', () => {
    window.location.href = '/dashboard/purchases';
  });

  submitPaymentRequest?.addEventListener('click', async () => {
    const paymentReference = proofReference.value.trim();
    const clientEmail = document.querySelector('[data-user-email]')?.dataset.userEmail || '';

    try {
      const response = await fetch('/api/purchases/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credits: selectedCredits,
          email: clientEmail,
          packageName: selectedPackageName,
          amount: selectedAmount,
          reference: paymentReference,
        })
      });

      const responseText = await response.text();
      let payload;
      try {
        payload = JSON.parse(responseText);
      } catch (error) {
        throw new Error(`Server returned non-JSON response: ${responseText || 'Empty response'}`);
      }
      if (!response.ok) {
        throw new Error(payload.error || payload.message || 'Purchase failure.');
      }

      paymentSubmitted = true;
      checkoutFormContent?.classList.add('hidden');
      paymentPendingState?.classList.remove('hidden');
      showNotice('Payment submitted and pending admin approval.');
    } catch (error) {
      const message = getErrorMessage(error, 'Purchase failure.');
      window.alert(message);
    }
  });

  document.querySelectorAll('.copy-number-btn').forEach((button) => {
    button.addEventListener('click', () => copyText(button.dataset.phone, 'Assigned number copied to clipboard.'));
  });

  document.getElementById('copyReferralLink')?.addEventListener('click', () => {
    const referralLink = document.getElementById('referralLink')?.value || '';
    copyText(referralLink, 'Referral link copied to clipboard.');
  });

  document.querySelectorAll('.delete-number-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Cancel this number session?')) return;
      button.disabled = true;
      try {
        const response = await fetch(`/api/numbers/${button.dataset.numberId}`, { method: 'DELETE' });
        const responseText = await response.text();
        let payload;
        try {
          payload = JSON.parse(responseText);
        } catch (error) {
          throw new Error(`Server returned non-JSON response: ${responseText || 'Empty response'}`);
        }
        if (!response.ok) throw new Error(payload.error || payload.message || 'Unable to cancel number.');
        button.closest('[data-number-id]')?.remove();
        showNotice(payload.message || 'Number session cancelled.');
      } catch (error) {
        showNotice(getErrorMessage(error, 'Unable to cancel number.'), 'error');
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll('.replace-number-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Replace this number?')) return;
      button.disabled = true;
      try {
        const response = await fetch(`/api/numbers/${button.dataset.numberId}/replace`, { method: 'POST' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || payload.message || 'Unable to replace number.');
        const card = button.closest('[data-number-id]');
        const heading = card?.querySelector('h3');
        if (heading) heading.textContent = payload.phone_number || payload.masked_phone_number;
        const copyButton = card?.querySelector('.copy-number-btn');
        if (copyButton) copyButton.dataset.phone = payload.phone_number;
        showNotice('Number replaced successfully.');
      } catch (error) {
        showNotice(getErrorMessage(error, 'Unable to replace number.'), 'error');
      } finally {
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll('.remove-number-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Delete this active number session?')) return;
      try {
        const response = await fetch(`/api/numbers/${button.dataset.numberId}/delete`, { method: 'DELETE' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || payload.message || 'Unable to delete number session.');
        button.closest('[data-number-id]')?.remove();
        showNotice(payload.message || 'Number session deleted.');
      } catch (error) {
        showNotice(getErrorMessage(error, 'Unable to delete number session.'), 'error');
      }
    });
  });

  document.querySelectorAll('.request-code-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const response = await fetch(`/api/numbers/${button.dataset.numberId}/request-code`, { method: 'POST' });
        const text = await response.text();
        let payload;
        try {
          payload = JSON.parse(text);
        } catch (error) {
          throw new Error(`Server returned non-JSON response: ${text || 'Empty response'}`);
        }
        if (!response.ok) throw new Error(payload.error || payload.message || 'Unable to request a verification code.');
        showNotice(payload.smsStatus === 'received' ? 'Verification code received.' : 'Checking for a new verification code.');
        window.setTimeout(() => window.location.reload(), 500);
      } catch (error) {
        showNotice(getErrorMessage(error, 'Unable to request a verification code.'), 'error');
      } finally {
        button.disabled = false;
      }
    });
  });

  document.getElementById('copyOpayAccount')?.addEventListener('click', () => {
    copyText(opaySettings.accountNumber, 'OPay account number copied to clipboard.');
  });

  document.getElementById('copyGuestAccount')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(button.dataset.accountNumber || '');
      const originalText = button.textContent;
      button.textContent = 'Copied!';
      window.setTimeout(() => { button.textContent = originalText; }, 1600);
    } catch (error) {
      showNotice('Copy failed. Please copy the account number manually.', 'error');
    }
  });

  document.getElementById('saveProfileBtn')?.addEventListener('click', async () => {
    const result = document.getElementById('profileResult');
    try {
      const response = await fetch('/api/me/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.getElementById('profileName').value.trim(),
          preferredRegion: document.getElementById('profileRegion').value,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Unable to save profile.');
      result.classList.remove('hidden');
      result.textContent = 'Profile saved successfully.';
    } catch (error) {
      result.classList.remove('hidden', 'border-emerald-200', 'bg-emerald-50', 'text-emerald-700');
      result.classList.add('border-rose-200', 'bg-rose-50', 'text-rose-700');
      result.textContent = getErrorMessage(error);
    }
  });

  const refreshCurrentUser = async () => {
    if (!document.querySelector('[data-credit-balance]')) return;
    try {
      const response = await fetch('/api/me', { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      document.querySelectorAll('[data-credit-balance]').forEach((element) => {
        element.textContent = payload.user.creditBalance;
      });
    } catch (error) {
      console.debug('User refresh unavailable');
    }
  };

  const refreshPurchaseHistory = async () => {
    const history = document.getElementById('purchaseHistory');
    if (!history) return;
    try {
      const response = await fetch('/api/me/transactions', { cache: 'no-store' });
      if (!response.ok) return;
      const transactions = await response.json();
      transactions.forEach((transaction) => {
        const row = history.querySelector(`[data-transaction-id="${transaction._id}"]`);
        if (!row) return;
        const status = row.querySelector('[data-transaction-status]');
        const credits = row.querySelector('[data-transaction-credits]');
        if (status) {
          status.textContent = transaction.status.toUpperCase();
          status.className = `rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${transaction.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : transaction.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`;
        }
        if (credits) credits.textContent = `${transaction.credits || 0} credits`;
      });
    } catch (error) {
      console.debug('Purchase history refresh unavailable');
    }
  };

  if (document.getElementById('purchaseHistory')) {
    refreshPurchaseHistory();
    window.setInterval(refreshPurchaseHistory, 5000);
  }
  if (document.querySelector('[data-credit-balance]')) {
    refreshCurrentUser();
    window.setInterval(refreshCurrentUser, 5000);
  }

  const refreshAdminUsers = async () => {
    const rows = document.querySelectorAll('.admin-user-row');
    if (!rows.length) return;
    try {
      const response = await fetch('/api/admin/users', { cache: 'no-store' });
      if (!response.ok) return;
      const users = await response.json();
      users.forEach((user) => {
        const row = document.querySelector(`.admin-user-row[data-user-id="${user._id}"]`);
        if (!row) return;
        row.querySelector('[data-admin-user-name]').textContent = user.name || 'Unnamed client';
        row.querySelector('[data-admin-user-region]').textContent = user.preferredRegion ? ` · ${user.preferredRegion}` : '';
        row.querySelector('[data-admin-user-balance]').textContent = `${user.creditBalance} credits`;
      });
    } catch (error) {
      console.debug('Admin user refresh unavailable');
    }
  };
  refreshAdminUsers();
  window.setInterval(refreshAdminUsers, 5000);

  const adminTransactionState = document.getElementById('adminTransactionState');
  if (adminTransactionState) {
    let knownTransactions = adminTransactionState.textContent || '[]';
    let isRefreshingTransactions = false;
    const refreshAdminTransactions = async () => {
      if (isRefreshingTransactions) return;
      isRefreshingTransactions = true;
      try {
        const response = await fetch(`/api/admin/transactions?refresh=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return;
        const transactions = await response.json();
        const currentTransactions = JSON.stringify(transactions.map((transaction) => ({
          id: transaction._id,
          status: transaction.status,
          credits: transaction.credits,
          amount: transaction.amount,
          timestamp: transaction.timestamp,
        })));
        if (currentTransactions !== knownTransactions) window.location.reload();
      } catch (error) {
        console.debug('Admin transaction refresh unavailable');
      } finally {
        isRefreshingTransactions = false;
      }
    };
    window.setInterval(refreshAdminTransactions, 5000);
  }

  document.querySelectorAll('[data-number-id]').forEach((card) => {
    const numberId = card.dataset.numberId;
    const expiresAt = card.dataset.expiresAt;
    if (expiresAt) {
      const target = new Date(expiresAt).getTime();
      const countdownEl = card.querySelector('.countdown');
      const tick = () => {
        const remaining = Math.max(0, target - Date.now());
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        countdownEl.textContent = `${minutes}m ${seconds}s`;
      };
      tick();
      setInterval(tick, 1000);
    }

    if (numberId) {
      const updateStatus = async () => {
        try {
          const response = await fetch(`/api/numbers/${numberId}/status`);
          const responseText = await response.text();
          let payload;
          try {
            payload = JSON.parse(responseText);
          } catch (error) {
            throw new Error(`Server returned non-JSON response: ${responseText || 'Empty response'}`);
          }
          if (!response.ok) throw new Error(payload.error || payload.message || 'Unable to check verification status.');

          const smsState = card.querySelector('.sms-state');
          if (smsState) {
            smsState.className = 'sms-state rounded-xl border p-3 text-sm';
            const latest = payload.received_codes?.length
              ? payload.received_codes[payload.received_codes.length - 1]
              : payload.verificationCode
                ? { verificationText: payload.verificationCode, timestamp: new Date() }
                : null;
            if (latest) {
              smsState.classList.add('border-emerald-100', 'bg-white', 'text-slate-700');
              smsState.innerHTML = `
                <p class="font-semibold text-slate-900">Code received:</p>
                <p class="mt-1 text-emerald-700">${latest.verificationText || latest.message}</p>
                <p class="mt-1 text-xs text-slate-500">${new Date(latest.timestamp).toLocaleString()}</p>
              `;
            } else {
              smsState.classList.add('border-dashed', 'border-slate-200', 'bg-white', 'text-slate-600');
              smsState.textContent = payload.smsStatus === 'waiting' ? 'Waiting for SMS...' : 'Checking activation status...';
            }
          }
        } catch (error) {
          console.error('Status refresh failed', error);
        }
      };
      updateStatus();
      setInterval(updateStatus, 10000);
    }
  });

  const submitSupportMessage = async (url, body) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'Unable to send support message.');
    return payload;
  };

  document.getElementById('supportForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const response = document.getElementById('supportResponse');
    try {
      await submitSupportMessage('/api/support/messages', {
        subject: document.getElementById('supportSubject').value.trim(),
        message: document.getElementById('supportMessage').value.trim(),
      });
      form.reset();
      response.classList.remove('hidden');
      response.textContent = 'Message sent. Support will reply here.';
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      response.classList.remove('hidden', 'border-emerald-200', 'bg-emerald-50', 'text-emerald-700');
      response.classList.add('border-rose-200', 'bg-rose-50', 'text-rose-700');
      response.textContent = getErrorMessage(error);
    }
  });

  document.querySelectorAll('.support-reply-form').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = form.querySelector('input[name="message"]');
      try {
        await submitSupportMessage(`/api/support/messages/${form.dataset.supportId}/reply`, { message: input.value.trim() });
        window.location.reload();
      } catch (error) {
        showNotice(getErrorMessage(error), 'error');
      }
    });
  });

  document.querySelectorAll('.admin-support-reply-form').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = form.querySelector('input[name="message"]');
      try {
        await submitSupportMessage(`/api/admin/support/${form.dataset.supportId}/reply`, { message: input.value.trim() });
        window.location.reload();
      } catch (error) {
        showNotice(getErrorMessage(error), 'error');
      }
    });
  });

  document.querySelectorAll('.admin-delete-support-thread').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Delete this support conversation?')) return;
      try {
        const response = await fetch(`/api/admin/support/${button.dataset.supportId}`, { method: 'DELETE' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || 'Unable to delete support chat.');
        showNotice(payload.message || 'Support chat deleted.');
        window.setTimeout(() => window.location.reload(), 400);
      } catch (error) {
        showNotice(getErrorMessage(error), 'error');
      }
    });
  });

  document.querySelectorAll('.admin-delete-support-user').forEach((button) => {
    button.addEventListener('click', async () => {
      const userId = button.dataset.userId;
      if (!userId || !window.confirm('Delete all support chats for this client?')) return;
      try {
        const response = await fetch(`/api/admin/support/user/${userId}`, { method: 'DELETE' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || 'Unable to delete client chats.');
        showNotice(payload.message || 'Client support chats deleted.');
        window.setTimeout(() => window.location.reload(), 400);
      } catch (error) {
        showNotice(getErrorMessage(error), 'error');
      }
    });
  });

  const adminSupportState = document.getElementById('adminSupportState');
  const clientSupportState = document.getElementById('supportState');
  const supportState = adminSupportState || clientSupportState;
  const clientSupportThreads = document.getElementById('supportThreads');
  if (supportState || clientSupportThreads) {
    const endpoint = adminSupportState ? '/api/admin/support' : '/api/support/messages';
    let knownSupport = supportState?.textContent || '';
    let isRefreshingSupport = false;
    const refreshSupport = async () => {
      if (isRefreshingSupport) return;
      isRefreshingSupport = true;
      try {
        const response = await fetch(`${endpoint}?refresh=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return;
        const threads = await response.json();
        const currentSupport = JSON.stringify(threads.map((thread) => ({
          id: thread._id,
          status: thread.status,
          updatedAt: thread.updatedAt,
          messageCount: (thread.messages || []).length,
          reply: thread.reply,
        })));
        if (currentSupport !== knownSupport) window.location.reload();
      } catch (error) {
        console.debug('Support refresh unavailable');
      } finally {
        isRefreshingSupport = false;
      }
    };
    window.setInterval(refreshSupport, 60000);
  }

  const opaySettingsForm = document.getElementById('opaySettingsForm');
  if (opaySettingsForm) {
    opaySettingsForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const bank = document.getElementById('opayBank').value.trim();
      const accountNumber = document.getElementById('opayAccountNumber').value.trim();
      const accountName = document.getElementById('opayAccountName').value.trim();
      const result = document.getElementById('opayResult');

      try {
        const response = await fetch('/api/admin/settings/opay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bank, accountNumber, accountName })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || 'Update failed.');
        result.classList.remove('hidden');
        result.textContent = payload.message;
      } catch (error) {
        result.classList.remove('hidden');
        result.classList.add('border-rose-200', 'bg-rose-50', 'text-rose-700');
        result.textContent = getErrorMessage(error);
      }
    });
  }

  const triggerTransactionAction = async (endpoint, message) => {
    const response = await fetch(endpoint, { method: 'POST' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || message);
    window.alert(payload.message || message);
    window.location.reload();
  };

  document.querySelectorAll('.approve-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await triggerTransactionAction(`/api/admin/transactions/${button.dataset.id}/approve`, 'Transaction approved.');
      } catch (error) {
        window.alert(getErrorMessage(error));
      }
    });
  });

  document.querySelectorAll('.pend-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await triggerTransactionAction(`/api/admin/transactions/${button.dataset.id}/pend`, 'Transaction marked pending.');
      } catch (error) {
        window.alert(getErrorMessage(error));
      }
    });
  });

  document.querySelectorAll('.fail-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await triggerTransactionAction(`/api/admin/transactions/${button.dataset.id}/fail`, 'Transaction marked failed.');
      } catch (error) {
        window.alert(getErrorMessage(error));
      }
    });
  });

  document.querySelectorAll('.delete-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Delete this transaction?')) return;
      try {
        const response = await fetch(`/api/admin/transactions/${button.dataset.id}`, { method: 'DELETE' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || 'Delete failed.');
        window.alert(payload.message || 'Transaction deleted.');
        window.location.reload();
      } catch (error) {
        window.alert(getErrorMessage(error));
      }
    });
  });

  document.querySelectorAll('.delete-user-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Hide this client from the admin dashboard? Their account and access will remain active.')) return;
      try {
        const response = await fetch(`/api/admin/users/${button.dataset.id}`, { method: 'DELETE' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || 'Unable to hide client.');
        button.closest('.admin-user-row')?.remove();
        showNotice('Client hidden from the admin dashboard. Their account remains active.');
      } catch (error) {
        showNotice(getErrorMessage(error), 'error');
      }
    });
  });
});