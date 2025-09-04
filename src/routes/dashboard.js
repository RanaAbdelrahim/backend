import express from 'express';
import { auth, requireRole } from '../middleware/auth.js';
import {
  DashboardUser,
  Metric,
  EngagementSlice,
  UpcomingEvent,
  Notification,
  SeatMap,
  SalesSummary
} from '../models/Dashboard.js';
import Event from '../models/Event.js';
import Booking from '../models/Booking.js';
import User from '../models/User.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(auth);

// Get user info
router.get('/user', async (req, res) => {
  try {
    const user = await DashboardUser.findOne().lean();
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get metrics
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await Metric.find().lean();
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get sales summary
router.get('/sales/summary', async (req, res) => {
  try {
    const summary = await SalesSummary.findOne().lean();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get engagement data
router.get('/engagement', async (req, res) => {
  try {
    const engagement = await EngagementSlice.find().lean();
    res.json(engagement);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get upcoming events
router.get('/upcoming', async (req, res) => {
  try {
    const events = await UpcomingEvent.find().lean();
    res.json(events);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get notifications
router.get('/notifications', async (req, res) => {
  try {
    const notifications = await Notification.find().lean();
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get seat map
router.get('/seatmap', async (req, res) => {
  try {
    const seatMap = await SeatMap.findOne().lean();
    res.json(seatMap);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * Get user's dashboards
 * GET /api/dashboard
 */
router.get('/', async (req, res) => {
  try {
    const dashboards = await Dashboard.find({ user: req.user._id });
    
    // If no dashboards exist for user, create a default one
    if (dashboards.length === 0) {
      const defaultDashboard = await createDefaultDashboard(req.user._id);
      return res.json([defaultDashboard]);
    }
    
    res.json(dashboards);
  } catch (error) {
    console.error('Error getting dashboards:', error);
    res.status(500).json({ message: 'Failed to get dashboards' });
  }
});

/**
 * Get a specific dashboard
 * GET /api/dashboard/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const dashboard = await Dashboard.findOne({
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!dashboard) {
      return res.status(404).json({ message: 'Dashboard not found' });
    }
    
    res.json(dashboard);
  } catch (error) {
    console.error('Error getting dashboard:', error);
    res.status(500).json({ message: 'Failed to get dashboard' });
  }
});

/**
 * Create a dashboard
 * POST /api/dashboard
 */
router.post('/', async (req, res) => {
  try {
    const { name, layout, isDefault } = req.body;
    
    // If setting as default, unset any existing default
    if (isDefault) {
      await Dashboard.updateMany(
        { user: req.user._id, isDefault: true },
        { $set: { isDefault: false } }
      );
    }
    
    const dashboard = new Dashboard({
      user: req.user._id,
      name,
      layout: layout || [],
      isDefault: isDefault || false
    });
    
    await dashboard.save();
    res.status(201).json(dashboard);
  } catch (error) {
    console.error('Error creating dashboard:', error);
    res.status(500).json({ message: 'Failed to create dashboard' });
  }
});

/**
 * Update a dashboard
 * PUT /api/dashboard/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const { name, layout, isDefault } = req.body;
    
    // If setting as default, unset any existing default
    if (isDefault) {
      await Dashboard.updateMany(
        { user: req.user._id, isDefault: true, _id: { $ne: req.params.id } },
        { $set: { isDefault: false } }
      );
    }
    
    const dashboard = await Dashboard.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      {
        $set: {
          name,
          layout,
          isDefault: isDefault || false,
          lastUpdated: new Date()
        }
      },
      { new: true }
    );
    
    if (!dashboard) {
      return res.status(404).json({ message: 'Dashboard not found' });
    }
    
    res.json(dashboard);
  } catch (error) {
    console.error('Error updating dashboard:', error);
    res.status(500).json({ message: 'Failed to update dashboard' });
  }
});

/**
 * Delete a dashboard
 * DELETE /api/dashboard/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const dashboard = await Dashboard.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!dashboard) {
      return res.status(404).json({ message: 'Dashboard not found' });
    }
    
    // If deleted dashboard was default, set another one as default
    if (dashboard.isDefault) {
      const anotherDashboard = await Dashboard.findOne({ user: req.user._id });
      if (anotherDashboard) {
        anotherDashboard.isDefault = true;
        await anotherDashboard.save();
      }
    }
    
    res.json({ message: 'Dashboard deleted successfully' });
  } catch (error) {
    console.error('Error deleting dashboard:', error);
    res.status(500).json({ message: 'Failed to delete dashboard' });
  }
});

/**
 * Get dashboard data
 * GET /api/dashboard/:id/data
 */
router.get('/:id/data', async (req, res) => {
  try {
    const dashboard = await Dashboard.findOne({
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!dashboard) {
      return res.status(404).json({ message: 'Dashboard not found' });
    }
    
    // Gather data for each widget
    const widgetData = await Promise.all(
      dashboard.layout.map(async (widget) => {
        let data = {};
        
        // Process based on dataSource
        switch (widget.dataSource) {
          case 'recentEvents':
            data = await Event.find()
              .sort({ date: -1 })
              .limit(5)
              .lean();
            break;
            
          case 'upcomingEvents':
            data = await Event.find({ 
              date: { $gte: new Date() } 
            })
              .sort({ date: 1 })
              .limit(5)
              .lean();
            break;
            
          case 'eventStats':
            data = {
              total: await Event.countDocuments(),
              upcoming: await Event.countDocuments({ 
                date: { $gte: new Date() } 
              }),
              past: await Event.countDocuments({ 
                date: { $lt: new Date() } 
              })
            };
            break;
            
          case 'bookingStats':
            data = {
              total: await Booking.countDocuments(),
              checkedIn: await Booking.countDocuments({ status: 'checked-in' }),
              pending: await Booking.countDocuments({ status: 'pending' }),
              revenue: (await Booking.aggregate([
                { $group: { _id: null, total: { $sum: '$pricePaid' } } }
              ]))[0]?.total || 0
            };
            break;
            
          case 'userStats':
            data = {
              total: await User.countDocuments(),
              admins: await User.countDocuments({ role: 'admin' }),
              users: await User.countDocuments({ role: 'user' })
            };
            break;
            
          default:
            data = { message: 'No data available for this widget' };
        }
        
        return {
          id: widget._id,
          type: widget.type,
          title: widget.title,
          data
        };
      })
    );
    
    res.json(widgetData);
  } catch (error) {
    console.error('Error getting dashboard data:', error);
    res.status(500).json({ message: 'Failed to get dashboard data' });
  }
});

/**
 * Create a default dashboard for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Created dashboard
 */
async function createDefaultDashboard(userId) {
  const defaultLayout = [
    {
      type: 'stats',
      title: 'Event Overview',
      dataSource: 'eventStats',
      size: { cols: 4, rows: 1 },
      position: { x: 0, y: 0 }
    },
    {
      type: 'stats',
      title: 'Booking Summary',
      dataSource: 'bookingStats',
      size: { cols: 4, rows: 1 },
      position: { x: 4, y: 0 }
    },
    {
      type: 'stats',
      title: 'User Statistics',
      dataSource: 'userStats',
      size: { cols: 4, rows: 1 },
      position: { x: 8, y: 0 }
    },
    {
      type: 'list',
      title: 'Upcoming Events',
      dataSource: 'upcomingEvents',
      size: { cols: 6, rows: 2 },
      position: { x: 0, y: 1 }
    },
    {
      type: 'list',
      title: 'Recent Events',
      dataSource: 'recentEvents',
      size: { cols: 6, rows: 2 },
      position: { x: 6, y: 1 }
    }
  ];
  
  const dashboard = new Dashboard({
    user: userId,
    name: 'Default Dashboard',
    isDefault: true,
    layout: defaultLayout
  });
  
  await dashboard.save();
  return dashboard;
}

export default router;
