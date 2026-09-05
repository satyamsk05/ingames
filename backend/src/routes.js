const express = require('express');
const router = express.Router();

const AuthController = require('./modules/auth/auth.controller');
const WalletController = require('./modules/wallet/wallet.controller');
const GameController = require('./modules/game/game.controller');
const { authMiddleware, optionalAuthMiddleware } = require('./core/auth_middleware');

// --- Auth Routes ---
router.post('/auth/send-otp', AuthController.sendOtp);
router.post('/auth/verify-otp', AuthController.verifyOtp);
router.post('/auth/google', AuthController.googleAuth);

// --- User Profile & Wallet Routes ---
router.get('/user/profile', optionalAuthMiddleware, WalletController.getProfileAndWallet);
router.post('/wallet/add-cash', optionalAuthMiddleware, WalletController.addCash);
router.post('/wallet/withdraw', optionalAuthMiddleware, WalletController.withdraw);
router.get('/wallet/transactions', optionalAuthMiddleware, WalletController.getTransactions);

// --- Game & Bet Routes ---
router.get('/games', GameController.getGames);
router.get('/games/7updown/current-round', GameController.get7UpDownRound);
router.post('/games/join', optionalAuthMiddleware, GameController.joinGameAndPlaceBet);
router.get('/games/bet-history', optionalAuthMiddleware, GameController.getBetHistory);

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
