import express from 'express';
import { auth, requireRole } from '../middleware/auth.js';
import ManageEvent from '../models/ManageEvent.js';
import Event from '../models/Event.js';

const router = express.Router();

// Apply authentication and admin role requirement
router.use(auth, requireRole('admin'));

/**
 * Get all event management data
 * GET /api/manage-events
 */
router.get('/', async (req, res) => {
  try {
    const manageEvents = await ManageEvent.find()
      .populate('event', 'title date venue status')
      .populate('staffMembers.user', 'name email')
      .sort({ 'event.date': -1 });
    
    res.json(manageEvents);
  } catch (error) {
    console.error('Error getting manage events:', error);
    res.status(500).json({ message: 'Failed to get manage events' });
  }
});

/**
 * Get a specific event management data
 * GET /api/manage-events/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const manageEvent = await ManageEvent.findById(req.params.id)
      .populate('event')
      .populate('staffMembers.user', 'name email');
    
    if (!manageEvent) {
      return res.status(404).json({ message: 'Event management data not found' });
    }
    
    res.json(manageEvent);
  } catch (error) {
    console.error('Error getting manage event:', error);
    res.status(500).json({ message: 'Failed to get manage event' });
  }
});

/**
 * Get management data for a specific event
 * GET /api/manage-events/event/:eventId
 */
router.get('/event/:eventId', async (req, res) => {
  try {
    const manageEvent = await ManageEvent.findOne({ event: req.params.eventId })
      .populate('event')
      .populate('staffMembers.user', 'name email');
    
    if (!manageEvent) {
      // Check if the event exists
      const event = await Event.findById(req.params.eventId);
      
      if (!event) {
        return res.status(404).json({ message: 'Event not found' });
      }
      
      // Create a new management record for this event
      const newManageEvent = await ManageEvent.create({
        event: event._id,
        checklistItems: [],
        staffMembers: [],
        vendors: [],
        budget: {
          allocated: 0,
          spent: 0
        },
        timeline: {
          eventStart: event.date
        }
      });
      
      await newManageEvent.populate('event');
      return res.json(newManageEvent);
    }
    
    res.json(manageEvent);
  } catch (error) {
    console.error('Error getting manage event by event ID:', error);
    res.status(500).json({ message: 'Failed to get manage event' });
  }
});

/**
 * Create or update event management data
 * POST /api/manage-events
 */
router.post('/', async (req, res) => {
  try {
    const { event: eventId, checklistItems, staffMembers, vendors, budget, timeline, notes } = req.body;
    
    // Verify the event exists
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    // Check if management data already exists for this event
    let manageEvent = await ManageEvent.findOne({ event: eventId });
    
    if (manageEvent) {
      // Update existing record
      manageEvent.checklistItems = checklistItems || manageEvent.checklistItems;
      manageEvent.staffMembers = staffMembers || manageEvent.staffMembers;
      manageEvent.vendors = vendors || manageEvent.vendors;
      manageEvent.budget = budget || manageEvent.budget;
      manageEvent.timeline = timeline || manageEvent.timeline;
      manageEvent.notes = notes !== undefined ? notes : manageEvent.notes;
      
      await manageEvent.save();
    } else {
      // Create new record
      manageEvent = await ManageEvent.create({
        event: eventId,
        checklistItems: checklistItems || [],
        staffMembers: staffMembers || [],
        vendors: vendors || [],
        budget: budget || { allocated: 0, spent: 0 },
        timeline: timeline || { eventStart: event.date },
        notes
      });
    }
    
    await manageEvent.populate('event');
    await manageEvent.populate('staffMembers.user', 'name email');
    
    res.status(201).json(manageEvent);
  } catch (error) {
    console.error('Error creating/updating manage event:', error);
    res.status(500).json({ message: 'Failed to create/update manage event' });
  }
});

/**
 * Update checklist items
 * PUT /api/manage-events/:id/checklist
 */
router.put('/:id/checklist', async (req, res) => {
  try {
    const { checklistItems } = req.body;
    
    if (!Array.isArray(checklistItems)) {
      return res.status(400).json({ message: 'checklistItems must be an array' });
    }
    
    const manageEvent = await ManageEvent.findByIdAndUpdate(
      req.params.id,
      { $set: { checklistItems } },
      { new: true }
    )
      .populate('event')
      .populate('staffMembers.user', 'name email');
    
    if (!manageEvent) {
      return res.status(404).json({ message: 'Event management data not found' });
    }
    
    res.json(manageEvent);
  } catch (error) {
    console.error('Error updating checklist:', error);
    res.status(500).json({ message: 'Failed to update checklist' });
  }
});

/**
 * Update staff members
 * PUT /api/manage-events/:id/staff
 */
router.put('/:id/staff', async (req, res) => {
  try {
    const { staffMembers } = req.body;
    
    if (!Array.isArray(staffMembers)) {
      return res.status(400).json({ message: 'staffMembers must be an array' });
    }
    
    const manageEvent = await ManageEvent.findByIdAndUpdate(
      req.params.id,
      { $set: { staffMembers } },
      { new: true }
    )
      .populate('event')
      .populate('staffMembers.user', 'name email');
    
    if (!manageEvent) {
      return res.status(404).json({ message: 'Event management data not found' });
    }
    
    res.json(manageEvent);
  } catch (error) {
    console.error('Error updating staff members:', error);
    res.status(500).json({ message: 'Failed to update staff members' });
  }
});

/**
 * Update vendors
 * PUT /api/manage-events/:id/vendors
 */
router.put('/:id/vendors', async (req, res) => {
  try {
    const { vendors } = req.body;
    
    if (!Array.isArray(vendors)) {
      return res.status(400).json({ message: 'vendors must be an array' });
    }
    
    const manageEvent = await ManageEvent.findByIdAndUpdate(
      req.params.id,
      { $set: { vendors } },
      { new: true }
    )
      .populate('event');
    
    if (!manageEvent) {
      return res.status(404).json({ message: 'Event management data not found' });
    }
    
    res.json(manageEvent);
  } catch (error) {
    console.error('Error updating vendors:', error);
    res.status(500).json({ message: 'Failed to update vendors' });
  }
});

/**
 * Update budget
 * PUT /api/manage-events/:id/budget
 */
router.put('/:id/budget', async (req, res) => {
  try {
    const { budget } = req.body;
    
    if (!budget || typeof budget !== 'object') {
      return res.status(400).json({ message: 'budget must be an object' });
    }
    
    const manageEvent = await ManageEvent.findByIdAndUpdate(
      req.params.id,
      { $set: { budget } },
      { new: true }
    )
      .populate('event');
    
    if (!manageEvent) {
      return res.status(404).json({ message: 'Event management data not found' });
    }
    
    res.json(manageEvent);
  } catch (error) {
    console.error('Error updating budget:', error);
    res.status(500).json({ message: 'Failed to update budget' });
  }
});

/**
 * Update timeline
 * PUT /api/manage-events/:id/timeline
 */
router.put('/:id/timeline', async (req, res) => {
  try {
    const { timeline } = req.body;
    
    if (!timeline || typeof timeline !== 'object') {
      return res.status(400).json({ message: 'timeline must be an object' });
    }
    
    const manageEvent = await ManageEvent.findByIdAndUpdate(
      req.params.id,
      { $set: { timeline } },
      { new: true }
    )
      .populate('event');
    
    if (!manageEvent) {
      return res.status(404).json({ message: 'Event management data not found' });
    }
    
    res.json(manageEvent);
  } catch (error) {
    console.error('Error updating timeline:', error);
    res.status(500).json({ message: 'Failed to update timeline' });
  }
});

/**
 * Delete event management data
 * DELETE /api/manage-events/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const manageEvent = await ManageEvent.findByIdAndDelete(req.params.id);
    
    if (!manageEvent) {
      return res.status(404).json({ message: 'Event management data not found' });
    }
    
    res.json({ message: 'Event management data deleted successfully' });
  } catch (error) {
    console.error('Error deleting manage event:', error);
    res.status(500).json({ message: 'Failed to delete manage event' });
  }
});

export default router;
