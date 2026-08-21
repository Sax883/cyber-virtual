document.addEventListener('DOMContentLoaded', () => {
  const bottomNav = document.querySelector('.bottom-nav');
  if (!bottomNav || window.getComputedStyle(bottomNav).display === 'none') {
    document.body.classList.remove('pb-24');
  }

  const FIXED_COUNTRIES = new Set(['USA', 'UK', 'Canada']);
  const COUNTRY_CREDIT_RULES = {
    USA: { standard: 8, premium: 15 },
    UK: { standard: 8, premium: 15 },
    Canada: { standard: 8, premium: 15 },
    Ghana: 7,
    India: 5,
    Germany: 13,
    France: 9,
    Brazil: 11,
  };
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

  const serviceButtons = document.querySelectorAll('.service-select');
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

  const showNotice = (message, tone = 'success') => {
    if (!workflowNotice) return;
    workflowNotice.textContent = message;
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

    if (FIXED_COUNTRIES.has(country)) {
      pricingSummary.textContent = `${country}: Standard 8 credits • Premium 15 credits`;
      premiumCheckbox.disabled = false;
      premiumCheckbox.checked = false;
    } else {
      const fixedValue = COUNTRY_CREDIT_RULES[country] || 7;
      const value = typeof fixedValue === 'object' ? fixedValue.standard : fixedValue;
      pricingSummary.textContent = `${country}: Fixed credit pricing • ${value} credits`;
      premiumCheckbox.disabled = true;
      premiumCheckbox.checked = false;
    }
  };

  serviceButtons.forEach((button) => {
    button.addEventListener('click', () => {
      serviceButtons.forEach((btn) => {
        btn.classList.remove('border-emerald-500', 'bg-emerald-50');
        btn.classList.add('border-slate-200', 'bg-slate-50');
      });
      button.classList.remove('border-slate-200', 'bg-slate-50');
      button.classList.add('border-emerald-500', 'bg-emerald-50');
      serviceInput.value = button.dataset.service;
      countryRegionPanel?.classList.remove('hidden');
      countryRegionPanel?.scrollIntoView({ behavior: 'smooth' });
      orderBtn?.removeAttribute('disabled');
      if (!selectedCountry && countrySelect) {
        setCountryState(countrySelect.value);
      }
    });
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
    const premium = premiumCheckbox.checked && FIXED_COUNTRIES.has(selectedCountry);
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
      const message = error instanceof Error ? error.message : String(error || 'Unable to request number.');
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
      const amount = Number(button.dataset.amount || packageMap[selectedCredits]?.amount || 0);
      checkoutPackage.value = selectedPackageName;
      checkoutAmount.value = `₦${amount.toLocaleString()}`;
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

    try {
      const response = await fetch('/purchases/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credits: selectedCredits,
          package_name: selectedPackageName,
          proof_reference: paymentReference,
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
      const message = error instanceof Error ? error.message : String(error || 'Purchase failure.');
      window.alert(message);
    }
  });

  document.querySelectorAll('.copy-number-btn').forEach((button) => {
    button.addEventListener('click', () => copyText(button.dataset.phone, 'Assigned number copied to clipboard.'));
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
        showNotice(error instanceof Error ? error.message : String(error || 'Unable to cancel number.'), 'error');
        button.disabled = false;
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
        showNotice(error instanceof Error ? error.message : String(error || 'Unable to request a verification code.'), 'error');
      } finally {
        button.disabled = false;
      }
    });
  });

  document.getElementById('copyOpayAccount')?.addEventListener('click', () => {
    copyText(opaySettings.accountNumber, 'OPay account number copied to clipboard.');
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
      result.textContent = error.message;
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
      response.textContent = error.message;
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
        showNotice(error.message, 'error');
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
        showNotice(error.message, 'error');
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
        showNotice(error.message, 'error');
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
        showNotice(error.message, 'error');
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
        result.textContent = error.message;
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
        window.alert(error.message);
      }
    });
  });

  document.querySelectorAll('.pend-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await triggerTransactionAction(`/api/admin/transactions/${button.dataset.id}/pend`, 'Transaction marked pending.');
      } catch (error) {
        window.alert(error.message);
      }
    });
  });

  document.querySelectorAll('.fail-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await triggerTransactionAction(`/api/admin/transactions/${button.dataset.id}/fail`, 'Transaction marked failed.');
      } catch (error) {
        window.alert(error.message);
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
        window.alert(error.message);
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
        showNotice(error.message, 'error');
      }
    });
  });
});