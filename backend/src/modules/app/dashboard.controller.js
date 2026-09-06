const db = require('../../config/db');
const ApiResponse = require('../../core/api_response');
const LedgerService = require('../wallet/ledger.service');

class DashboardController {
  async getDashboardHeader(req, res) {
    try {
      let balance = 0.0;
      let depositBalance = 0.0;
      let winningsBalance = 0.0;
      let rewardsBalance = 0.0;
      let username = 'Player_0480';
      let avatarUrl = 'Assets/Avatar/avatar_1.png';
      let phoneNumber = '7088800480';

      const getAvatarUrl = (pathOrName) => {
        if (!pathOrName) return '/avatars/avatar_1.png';
        if (pathOrName.startsWith('http')) return pathOrName;
        const parts = pathOrName.split('/');
        const filename = parts[parts.length - 1] || 'avatar_1.png';
        return `/avatars/${filename}`;
      };

      if (req.user && req.user.id) {
        try {
          const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
          if (user) {
            username = user.username || `Player_${user.id.slice(-4)}`;
            if (user.avatar_path) avatarUrl = getAvatarUrl(user.avatar_path);
            if (user.phone) phoneNumber = user.phone;

            const walletSummary = LedgerService.getWalletSummary(req.user.id);
            if (walletSummary) {
              depositBalance = walletSummary.cashBalance || 0.0;
              winningsBalance = walletSummary.winningsBalance || 0.0;
              rewardsBalance = walletSummary.bonusBalance || 0.0;
              balance = walletSummary.totalBalance || 0.0;
            }
          }
        } catch (_) {}
      } else {
        avatarUrl = getAvatarUrl(avatarUrl);
      }

      return ApiResponse.success(res, {
        profile: {
          username,
          avatarUrl,
          avatarFrameUrl: '/frames/golden_ring.png',
          ringColor: '#FFD700',
          balance,
          phoneNumber,
          isKycVerified: true,
          profileTag: 'Profile',
        },
        wallet: {
          depositBalance,
          winningsBalance,
          rewardsBalance,
          totalBalance: balance,
          bestDeal: {
            amount: 500,
            cashback: 75,
            tag: 'BEST DEAL',
          },
        },
        addCashOffers: [
          { amount: 200, cashback: 25 },
          { amount: 500, cashback: 75 },
          { amount: 50, cashback: 4 },
          { amount: 100, cashback: 10 },
        ],
        referral: {
          totalEarnings: 30,
          perReferralTarget: 1000,
          rewardSteps: {
            signUp: 15,
            addCash: 55,
            playGames: 930,
          },
          recentReferrals: [
            {
              name: 'Dh animation',
              date: '09 Dec',
              amount: '₹15',
              avatarPath: '/avatars/avatar_1.png',
            },
            {
              name: 'Harshthakur',
              date: '08 Dec',
              amount: '₹15',
              avatarPath: '/avatars/avatar_2.png',
            },
            {
              name: 'RAHUL',
              date: '07 Dec',
              amount: '₹15',
              avatarPath: '/avatars/avatar_3.png',
            },
          ],
        },
        onlinePlayers: {
          totalOnline: 89156,
          ringColors: ['#FFD700', '#FF9800', '#4FC3F7'],
          avatars: [
            '/avatars/avatar_1.png',
            '/avatars/avatar_2.png',
            '/avatars/avatar_3.png',
            '/avatars/avatar_7.png',
            '/avatars/avatar_8.png',
            '/avatars/avatar_9.png',
          ],
        },
        banners: [
          {
            id: 'deposit_bonus_180',
            tag: 'DEPOSIT',
            title: 'DEPOSIT BONUS\n180% BONUS',
            subtitle: 'DEPOSIT -> GET BONUS',
            buttonText: 'DEPOSIT NOW',
            imageUrl: '/banners/deposit_banner.png',
            targetScreen: '/add-cash',
          },
        ],
        games: [
          {
            id: 'classic_dice',
            title: 'Classic Dice',
            imagePath: '/games/classic_dice.png',
            accentColor: '#00E676',
            gameUrl: '/games/seven_up_down/index.html',
            isAvailable: true,
          },
          {
            id: 'double',
            title: 'Double',
            imagePath: '/games/double.png',
            accentColor: '#FFD700',
            gameUrl: '/games/seven_up_down/index.html',
            isAvailable: false,
          },
          {
            id: '7updown',
            title: '7 Up Down',
            imagePath: '/games/7updown.png',
            accentColor: '#FF4081',
            gameUrl: '/games/seven_up_down/index.html',
            isAvailable: true,
          },
          {
            id: 'mines',
            title: 'Mines',
            imagePath: '/games/mines.png',
            accentColor: '#7C4DFF',
            gameUrl: '/games/seven_up_down/index.html',
            isAvailable: false,
          },
        ],
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      return ApiResponse.error(res, error.message || 'Failed to fetch dashboard data', 500);
    }
  }
}

module.exports = new DashboardController();
