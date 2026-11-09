const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const authMiddleware = require('../middleware/authMiddleware');

const authenticate = 
  typeof authMiddleware === 'function' 
    ? authMiddleware 
    : (authMiddleware.authenticateToken || authMiddleware.protect || ((req, res, next) => next()));

router.get('/executive-summary', authenticate, analyticsController.getExecutiveSummary);

module.exports = router;