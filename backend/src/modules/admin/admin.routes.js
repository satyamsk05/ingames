const express = require('express');
const router = express.Router();
const AdminController = require('./admin.controller');
const adminMiddleware = require('../../core/admin_middleware');

// Public Admin Auth Route
router.post('/login', (req, res) => AdminController.login(req, res));

// Protected Admin Routes
router.get('/stats', adminMiddleware, (req, res) => AdminController.getStats(req, res));
router.get('/users', adminMiddleware, (req, res) => AdminController.getUsers(req, res));
router.post('/users/update-balance', adminMiddleware, (req, res) => AdminController.updateUserBalance(req, res));
router.post('/users/toggle-block', adminMiddleware, (req, res) => AdminController.toggleUserBlock(req, res));

router.get('/withdrawals', adminMiddleware, (req, res) => AdminController.getWithdrawals(req, res));
router.post('/withdrawals/approve', adminMiddleware, (req, res) => AdminController.approveWithdrawal(req, res));
router.post('/withdrawals/reject', adminMiddleware, (req, res) => AdminController.rejectWithdrawal(req, res));

router.get('/games/configs', adminMiddleware, (req, res) => AdminController.getGameConfigs(req, res));

module.exports = router;
