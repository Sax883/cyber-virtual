const express = require('express');
const BoostOrder = require('../models/BoostOrder');
const User = require('../models/User');
const { ensureAuthenticated, ensureAdmin } = require('../middleware/auth');
const { getBoostQuote, addBoostOrder, getBoostOrderStatus } = require('../services/smmService');

const router = express.Router();

const PLATFORMS = ['TikTok', 'Facebook', 'Instagram', 'Snapchat', 'Telegram'];
const SERVICES = ['Followers', 'Likes', 'Comments'];
async function getBoostDetails(body = {}) {
  const platform = String(body.platform || '').trim();
  const service = String(body.service || '').trim();
  const target = String(body.target || '').trim();
  const quantity = Number(body.quantity);

  if (!PLATFORMS.includes(platform)) return { error: 'Select a supported platform.' };
  if (!SERVICES.includes(service)) return { error: 'Select a supported service.' };
  if (!target || target.length > 500) return { error: 'Enter a valid profile URL or username.' };
  if (quantity < 100 || quantity > 100000 || !Number.isInteger(quantity)) return { error: 'Quantity must be a whole number from 100 to 100,000.' };

  try {
    const quote = await getBoostQuote(platform, quantity);
    return { platform, service, target, quantity, ...quote, credits: Math.ceil(quote.amount / 1000) };
  } catch (error) {
    return { error: error.message };
  }
}

function getGuestEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function getProofOfPayment(value) {
  const proof = String(value || '').trim();
  return /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(proof) && proof.length <= 7 * 1024 * 1024 ? proof : '';
}

async function startCampaign(order) {
  try {
    const providerOrder = await addBoostOrder({ platform: order.platform, target: order.target, quantity: order.quantity });
    order.providerOrderId = providerOrder.providerOrderId;
    order.serviceId = providerOrder.serviceId;
    order.status = 'in_progress';
    order.startedAt = order.startedAt || new Date();
    order.failureReason = '';
    await order.save();
    return true;
  } catch (error) {
    order.status = 'failed';
    order.failureReason = error.message;
    await order.save().catch((saveError) => console.error('Unable to record failed JAP campaign:', saveError.message));
    return false;
  }
}

async function refreshProviderStatus(order) {
  if (!order.providerOrderId || ['completed', 'failed', 'cancelled'].includes(order.status)) return;
  try {
    const providerStatus = await getBoostOrderStatus(order.providerOrderId);
    order.status = providerStatus.status;
    if (providerStatus.remains !== null) order.delivered = Math.max(0, order.quantity - providerStatus.remains);
    if (order.status === 'completed') order.completedAt = order.completedAt || new Date();
    await order.save();
  } catch (error) {
    console.error('JAP status check failed:', error.message);
  }
}

router.post('/guest', async (req, res) => {
  const details = await getBoostDetails(req.body);
  const guestEmail = getGuestEmail(req.body.email);
  const paymentReference = String(req.body.paymentReference || req.body.proofReference || '').trim();
  const proofOfPayment = getProofOfPayment(req.body.proofOfPayment);
  if (details.error) return res.status(400).json({ message: details.error });
  if (!guestEmail) return res.status(400).json({ message: 'Enter a valid email for order updates.' });

  try {
    const order = await BoostOrder.create({
      ...details,
      guestEmail,
      status: 'pending_payment',
      paymentReference,
      proofOfPayment,
    });
    return res.status(201).json({ success: true, orderId: order._id, message: 'Boost request received. We will email your order updates after payment review.' });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to submit boost request.' });
  }
});

router.get('/quote', async (req, res) => {
  const platform = String(req.query.platform || '').trim();
  const quantity = Number(req.query.quantity);
  if (!PLATFORMS.includes(platform) || !Number.isInteger(quantity) || quantity < 100 || quantity > 100000) {
    return res.status(400).json({ message: 'Select a supported platform and valid quantity.' });
  }
  try {
    const quote = await getBoostQuote(platform, quantity);
    return res.json({ ...quote, credits: Math.ceil(quote.amount / 1000) });
  } catch (error) {
    return res.status(502).json({ message: error.message });
  }
});

router.post('/orders', ensureAuthenticated, async (req, res) => {
  const details = await getBoostDetails(req.body);
  if (details.error) return res.status(400).json({ message: details.error });

  try {
    const user = await User.findOneAndUpdate(
      { _id: req.session.user.id, creditBalance: { $gte: details.credits } },
      { $inc: { creditBalance: -details.credits } },
      { new: true },
    );
    if (!user) return res.status(400).json({ message: `You need ${details.credits} credits to start this boost.` });

    const order = await BoostOrder.create({ ...details, user_id: user._id, paymentMethod: 'wallet', status: 'queued' });
    const started = await startCampaign(order);
    if (!started) {
      await User.updateOne({ _id: user._id }, { $inc: { creditBalance: details.credits } });
      return res.status(502).json({ message: order.failureReason || 'JAP could not accept this campaign.' });
    }
    req.session.user.creditBalance = user.creditBalance;
    return res.status(201).json({ success: true, order, balance: user.creditBalance, message: 'Boost campaign queued successfully.' });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to create boost campaign.' });
  }
});

router.post('/orders/manual', ensureAuthenticated, async (req, res) => {
  const details = await getBoostDetails(req.body);
  if (details.error) return res.status(400).json({ message: details.error });
  const paymentReference = String(req.body.paymentReference || req.body.proofReference || '').trim();
  const proofOfPayment = getProofOfPayment(req.body.proofOfPayment);

  try {
    const order = await BoostOrder.create({ ...details, user_id: req.session.user.id, paymentMethod: 'manual', status: 'pending_payment', paymentReference, proofOfPayment });
    return res.status(201).json({ success: true, order, message: 'Manual payment request submitted for admin confirmation.' });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to submit manual payment request.' });
  }
});

router.get('/orders', ensureAuthenticated, async (req, res) => {
  const orders = await BoostOrder.find({ user_id: req.session.user.id }).sort({ createdAt: -1 }).limit(50);
  await Promise.all(orders.map(refreshProviderStatus));
  return res.json(orders);
});

router.get('/admin/orders', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const orders = await BoostOrder.find().populate('user_id', 'name email').sort({ createdAt: -1 }).limit(100);
  await Promise.all(orders.map(refreshProviderStatus));
  return res.json(orders);
});

router.patch('/admin/orders/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const status = ['pending_payment', 'queued', 'in_progress', 'completed', 'failed', 'cancelled'].includes(req.body.status) ? req.body.status : '';
  if (!status) return res.status(400).json({ message: 'Invalid campaign status.' });
  const order = await BoostOrder.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Campaign not found.' });
  if (status === 'in_progress') {
    const started = await startCampaign(order);
    if (!started) return res.status(502).json({ message: order.failureReason || 'JAP could not accept this campaign.', order: order.toObject() });
  } else {
    order.status = status;
    if (status === 'cancelled') order.failureReason = 'Cancelled by administrator.';
    await order.save();
  }
  return res.json({ success: true, order: order.toObject() });
});

router.delete('/admin/orders/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const deleted = await BoostOrder.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ message: 'Campaign not found.' });
  return res.json({ success: true, message: 'Boost request deleted.' });
});

router.post('/admin/orders/:id/confirm', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const order = await BoostOrder.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Campaign not found.' });
  if (order.providerOrderId) {
    return res.json({ success: true, order: order.toObject(), message: 'JAP campaign is already active for this request.' });
  }

  const started = await startCampaign(order);
  if (!started) return res.status(502).json({ message: order.failureReason || 'JAP could not accept this campaign.', order: order.toObject() });
  return res.json({ success: true, order: order.toObject(), message: 'Payment confirmed and JAP campaign triggered.' });
});

module.exports = router;
