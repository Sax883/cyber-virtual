const express = require('express');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { ensureAuthenticated } = require('../middleware/auth');
const { sendCreditPurchaseWhatsAppNotification } = require('../services/twilioService');

const router = express.Router();

const packageMap = {
  1: { amount: 1000, label: '1 Credit' },
  5: { amount: 3000, label: '5 Credits' },
  10: { amount: 5000, label: '10 Credits' },
};

router.post('/checkout', ensureAuthenticated, async (req, res) => {
  const { credits, proof_reference = '', package_name = '' } = req.body;
  const selectedCredits = Number(credits);

  if (!packageMap[selectedCredits]) {
    return res.status(400).json({ message: 'Invalid package selection.' });
  }

  try {
    const user = await User.findById(req.session.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const packageInfo = packageMap[selectedCredits];
    const transaction = await Transaction.create({
      user_id: user._id,
      amount: packageInfo.amount,
      gateway: 'manual_checkout',
      status: 'pending',
      credits: selectedCredits,
      package_name: package_name || packageInfo.label,
      proof_reference: proof_reference || '',
    });

    let notification = { success: false, message: 'Notification delivery unavailable.' };
    try {
      notification = await sendCreditPurchaseWhatsAppNotification({
        packageName: package_name || packageInfo.label,
        amount: packageInfo.amount,
        userEmail: user.email,
      });
    } catch (notificationError) {
      console.error('Purchase notification failed:', notificationError.message);
    }

    return res.json({
      success: true,
      credits: selectedCredits,
      amount: packageInfo.amount,
      transactionId: transaction._id,
      status: 'pending',
      notification,
      message: 'Purchase request submitted successfully. Awaiting admin approval.',
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to submit purchase request.' });
  }
});

module.exports = router;
