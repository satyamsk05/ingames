const express = require('express');
const router = express.Router();

const AuthController = require('./modules/auth/auth.controller');
const WalletController = require('./modules/wallet/wallet.controller');
const GameController = require('./modules/game/game.controller');
const { authMiddleware } = require('./core/auth_middleware');

// --- Auth Routes (Public) ---
router.post('/auth/send-otp', AuthController.sendOtp);
router.post('/auth/verify-otp', AuthController.verifyOtp);
router.post('/auth/google', AuthController.googleAuth);
router.post('/auth/guest', AuthController.guestAuth);
router.post('/auth/auth0', AuthController.auth0Auth);

// --- User Profile & Wallet Routes (Strict Auth Required) ---
router.get('/user/profile', authMiddleware, WalletController.getProfileAndWallet);
router.post('/wallet/deposits/orders', authMiddleware, WalletController.createDepositOrder);
router.post('/wallet/add-cash', authMiddleware, WalletController.createDepositOrder); // Legacy alias
router.post('/wallet/deposits/webhook', WalletController.depositWebhook); // Webhook callback
router.post('/wallet/withdraw', authMiddleware, WalletController.withdraw);
router.get('/wallet/transactions', authMiddleware, WalletController.getTransactions);

// --- Game & Bet Routes ---
router.get('/games', GameController.getGames);
router.get('/games/7updown/current-round', GameController.get7UpDownRound);
router.post('/games/join', authMiddleware, GameController.joinGameAndPlaceBet);
router.get('/games/bet-history', authMiddleware, GameController.getBetHistory);

// App Config Endpoint
router.get('/config', (req, res) => {
  res.json({
    status: 'success',
    version: '1.0.0',
    minVersionRequired: '1.0.0',
    maintenanceMode: false,
    updateUrl: 'https://ingames.app/download',
  });
});

module.exports = router;
