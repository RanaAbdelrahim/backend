import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import { auth, requireRole } from '../middleware/auth.js';
import User from '../models/User.js';
import Booking from '../models/Booking.js';
import Event from '../models/Event.js';

const router = express.Router();

// All routes require authentication and admin role
router.use(auth, requireRole('admin'));

/**
 * List users with filtering and pagination
 * GET /api/admin/users?q=&status=&role=&page=1&limit=20
 */
router.get('/users', [
  query('q').optional().isString().trim(),
  query('status').optional().isIn(['active', 'inactive']),
  query('role').optional().isIn(['admin', 'user']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Invalid query parameters', errors: errors.array() });
    }

    const { q, status, role } = req.query;
    const page = parseInt(req.query.page || 1);
    const limit = parseInt(req.query.limit || 20);
    const skip = (page - 1) * limit;
    
    // Build filter based on query parameters
    const filter = {};
    
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } }
      ];
    }
    
    if (status) {
      filter.status = status;
    }
    
    if (role) {
      filter.role = role;
    }
    
    // Execute query with pagination
    const [items, total] = await Promise.all([
      User.find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter)
    ]);
    
    // Transform _id to id for frontend
    const formattedItems = items.map(user => ({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status || 'active', // Default to active if not set
      lastLogin: user.lastLogin || user.updatedAt,
      createdAt: user.createdAt
    }));
    
    res.json({
      items: formattedItems,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ message: 'Server error while listing users' });
  }
});

/**
 * Get a single user
 * GET /api/admin/users/:id
 */
router.get('/users/:id', [
  param('id').isMongoId().withMessage('Invalid user ID format')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Invalid user ID', errors: errors.array() });
    }

    const user = await User.findById(req.params.id).select('-password').lean();
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Transform _id to id for frontend
    const formattedUser = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status || 'active',
      lastLogin: user.lastLogin || user.updatedAt,
      createdAt: user.createdAt
    };
    
    res.json(formattedUser);
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ message: 'Server error while getting user' });
  }
});

/**
 * Create a new user
 * POST /api/admin/users
 */
router.post('/users', [
  body('name').notEmpty().withMessage('Name is required').trim(),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['admin', 'user']).withMessage('Role must be either admin or user')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation error', errors: errors.array() });
    }

    const { name, email, password, role } = req.body;
    
    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already in use' });
    }
    
    // Create new user
    const newUser = new User({
      name,
      email,
      password, // Will be hashed by User model pre-save hook
      role: role || 'user',
      status: 'active'
    });
    
    await newUser.save();
    
    // Return user without password
    const savedUser = await User.findById(newUser._id).select('-password').lean();
    
    res.status(201).json({
      id: savedUser._id,
      name: savedUser.name,
      email: savedUser.email,
      role: savedUser.role,
      status: savedUser.status
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Server error while creating user' });
  }
});

/**
 * Update a user
 * PUT /api/admin/users/:id
 */
router.put('/users/:id', [
  param('id').isMongoId().withMessage('Invalid user ID format'),
  body('name').optional().notEmpty().withMessage('Name cannot be empty').trim(),
  body('email').optional().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('role').optional().isIn(['admin', 'user']).withMessage('Role must be either admin or user'),
  body('status').optional().isIn(['active', 'inactive']).withMessage('Status must be either active or inactive')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation error', errors: errors.array() });
    }

    const userId = req.params.id;
    const { name, email, role, status } = req.body;
    
    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if trying to modify self
    const isSelf = req.user._id.toString() === userId.toString();
    
    // If changing email, check if new email already exists (unless it's the same user)
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }
    
    // Guardrail: Users can't change their own role or status via admin panel
    if (isSelf && (role !== undefined || status !== undefined)) {
      return res.status(400).json({ 
        message: 'You cannot change your own role or status. Another admin must do this.' 
      });
    }
    
    // Guardrail: Cannot demote the only remaining admin
    if (role === 'user' && user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ 
          message: 'Cannot demote the only admin. Create another admin first.' 
        });
      }
    }
    
    // Update user fields that were provided
    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email;
    if (role !== undefined) user.role = role;
    if (status !== undefined) user.status = status;
    
    await user.save();
    
    // Return updated user
    const updatedUser = await User.findById(userId).select('-password').lean();
    
    res.json({
      id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      status: updatedUser.status,
      lastLogin: updatedUser.lastLogin || updatedUser.updatedAt
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Server error while updating user' });
  }
});

/**
 * Change user status (activate/deactivate)
 * PATCH /api/admin/users/:id/status
 */
router.patch('/users/:id/status', [
  param('id').isMongoId().withMessage('Invalid user ID format'),
  body('status').isIn(['active', 'inactive']).withMessage('Status must be either active or inactive')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation error', errors: errors.array() });
    }

    const userId = req.params.id;
    const { status } = req.body;
    
    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Guardrail: Cannot deactivate self
    if (req.user._id.toString() === userId.toString()) {
      return res.status(400).json({ 
        message: 'You cannot change your own status. Another admin must do this.' 
      });
    }
    
    // Guardrail: Cannot deactivate the only admin
    if (status === 'inactive' && user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ 
          message: 'Cannot deactivate the only admin. Create another admin first.' 
        });
      }
    }
    
    // Update status
    user.status = status;
    await user.save();
    
    // Return updated user
    const updatedUser = await User.findById(userId).select('-password').lean();
    
    res.json({
      id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      status: updatedUser.status,
      lastLogin: updatedUser.lastLogin || updatedUser.updatedAt
    });
  } catch (error) {
    console.error('Error changing user status:', error);
    res.status(500).json({ message: 'Server error while changing user status' });
  }
});

/**
 * Delete a user
 * DELETE /api/admin/users/:id
 */
router.delete('/users/:id', [
  param('id').isMongoId().withMessage('Invalid user ID format')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Invalid user ID', errors: errors.array() });
    }

    const userId = req.params.id;
    
    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Guardrail: Cannot delete self
    if (req.user._id.toString() === userId.toString()) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }
    
    // Guardrail: Cannot delete the only admin
    if (user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ 
          message: 'Cannot delete the only admin. Create another admin first.' 
        });
      }
    }
    
    // Check for dependencies (events created, bookings)
    const hasEvents = await Event.exists({ createdBy: userId });
    const hasBookings = await Booking.exists({ user: userId });
    
    if (hasEvents || hasBookings) {
      // Soft delete: mark as inactive + set deletedAt
      user.status = 'inactive';
      user.deletedAt = new Date();
      await user.save();
      
      return res.json({ 
        ok: true, 
        message: 'User has been deactivated due to existing data dependencies' 
      });
    }
    
    // Hard delete if no dependencies
    await User.deleteOne({ _id: userId });
    
    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Server error while deleting user' });
  }
});

export default router;
