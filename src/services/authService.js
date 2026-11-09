const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

class AuthService {
  static async login(email, password) {
    const user = await db('users')
      .join('roles', 'users.role_id', 'roles.id')
      .select(
        'users.id',
        'users.first_name',
        'users.last_name',
        'users.email',
        'users.password_hash',
        'users.is_active',
        'users.subsidiary_id',
        'roles.name as role_name',
        'roles.id as role_id'
      )
      .where('users.email', email.toLowerCase().trim())
      .first();

    if (!user || !user.is_active) {
      throw new Error('Invalid email or account disabled.');
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid credentials.');
    }

    // Retrieve user permissions
    let permissions = [];
    if (user.role_name === 'SUPER_ADMIN') {
      permissions = ['*'];
    } else {
      const userPerms = await db('role_permissions')
        .join('permissions', 'role_permissions.permission_id', 'permissions.id')
        .where('role_permissions.role_id', user.role_id)
        .select('permissions.slug');
      permissions = userPerms.map(p => p.slug);
    }

    // Generate JWT Token
    const payload = {
      userId: user.id,
      role: user.role_name,
      subsidiaryId: user.subsidiary_id,
      permissions
    };

    const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret || !jwtSecret.trim()) {
  throw new Error('Authentication service is not configured.');
}

const token = jwt.sign(payload, jwtSecret, {
  expiresIn: '12h',
  algorithm: 'HS256'
});
    // Update last login
    await db('users').where({ id: user.id }).update({ last_login: db.fn.now() });

    return {
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role_name,
        subsidiaryId: user.subsidiary_id,
        permissions
      }
    };
  }

  static async getUserProfile(userId) {
    const user = await db('users')
      .join('roles', 'users.role_id', 'roles.id')
      .select(
        'users.id',
        'users.first_name',
        'users.last_name',
        'users.email',
        'users.phone',
        'users.subsidiary_id',
        'roles.name as role_name',
        'roles.display_name as role_display'
      )
      .where('users.id', userId)
      .first();

    if (!user) {
      throw new Error('User not found.');
    }

    return user;
  }
}

module.exports = AuthService;