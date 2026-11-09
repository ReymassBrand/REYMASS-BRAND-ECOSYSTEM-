const AuthService = require('../services/authService');

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const result = await AuthService.login(email, password);
    return res.status(200).json({
      success: true,
      message: 'Authentication successful.',
      data: result
    });
  } catch (error) {
    return res.status(401).json({ success: false, message: error.message });
  }
};

const getMe = async (req, res) => {
  try {
    const profile = await AuthService.getUserProfile(req.user.userId);
    return res.status(200).json({
      success: true,
      data: {
        ...profile,
        permissions: req.user.permissions
      }
    });
  } catch (error) {
    return res.status(404).json({ success: false, message: error.message });
  }
};

module.exports = { login, getMe };