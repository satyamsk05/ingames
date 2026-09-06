const express = require('express');
const router = express.Router();

const AuthController = require('./modules/auth/auth.controller');
const WalletController = require('./modules/wallet/wallet.controller');
const GameController = require('./modules/game/game.controller');
const DashboardController = require('./modules/app/dashboard.controller');
const { authMiddleware, optionalAuthMiddleware } = require('./core/auth_middleware');

// --- Dashboard & Config Routes ---
router.get('/app/dashboard-header', optionalAuthMiddleware, DashboardController.getDashboardHeader);

// --- Auth Routes (Public) ---
router.post('/auth/loggin/create-token', AuthController.createLogginToken);
router.post('/auth/loggin/verify-token', AuthController.verifyLogginToken);
router.post('/auth/guest', AuthController.guestAuth);

// --- User Profile & Wallet Routes (Strict Auth Required) ---
router.get('/user/profile', authMiddleware, WalletController.getProfileAndWallet);
router.put('/user/profile', authMiddleware, AuthController.updateProfile);
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
