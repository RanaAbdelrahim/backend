import express from 'express';
import { auth, requireRole } from '../middleware/auth.js';
import Event from '../models/Event.js';
import Booking from '../models/Booking.js';

const router = express.Router();

// Validate event data
function validateEvent(req, res, next) {
  const { title, venue, date, price } = req.body;
  
  if (!title || !venue || !date || price === undefined) {
    return res.status(400).json({ 
      message: 'Missing required fields: title, venue, date, price are required' 
    });
  }
  
  // Validate price is positive
  if (price < 0) {
    return res.status(400).json({ message: 'Price cannot be negative' });
  }
  
  // Validate date format and not in the past
  try {
    const eventDate = new Date(date);
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Compare dates without time
    
    if (req.method === 'POST' && eventDate < now) {
      return res.status(400).json({ message: 'Event date cannot be in the past' });
    }
  } catch (e) {
    return res.status(400).json({ message: 'Invalid date format' });
  }
  
  next();
}

// Create event (admin)
router.post('/', auth, requireRole('admin'), validateEvent, async (req, res) => {
  try {
    const event = await Event.create(req.body);
    res.status(201).json(event);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// List events with filters
router.get('/', async (req, res) => {
  try {
    const { q, status, tag } = req.query;
    const filter = {};
    
    if (status) filter.status = status;
    if (q) filter.title = { $regex: String(q), $options: 'i' };
    if (tag) filter.tags = { $in: [tag] };
    
    const events = await Event.find(filter).sort({ date: 1 }).lean();
    res.json(events);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get single event
router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).lean();
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json(event);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update event (admin)
router.put('/:id', auth, requireRole('admin'), validateEvent, async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json(event);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete event (admin)
router.delete('/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    // Check if any bookings exist for this event
    const bookingCount = await Booking.countDocuments({ event: req.params.id });
    if (bookingCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete event with ${bookingCount} existing bookings` 
      });
    }
    
    await Event.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Reserve seats (admin manual allocation)
router.post('/:id/reserve', auth, requireRole('admin'), async (req, res) => {
  try {
    const { seats } = req.body; // ["R1C1", ...]
    if (!seats || !Array.isArray(seats)) {
      return res.status(400).json({ message: 'Seats array is required' });
    }
    
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    
    // Check if any seats are already reserved or sold
    const unavailable = [];
    const allUsed = new Set([...(event.seatMap.reserved || []), ...(event.seatMap.sold || [])]);
    
    for (const seat of seats) {
      if (allUsed.has(seat)) {
        unavailable.push(seat);
      }
    }
    
    if (unavailable.length > 0) {
      return res.status(400).json({ 
        message: `Seats already taken: ${unavailable.join(', ')}` 
      });
    }
    
    // All seats are available, add to reserved
    event.seatMap.reserved = Array.from(new Set([...(event.seatMap.reserved || []), ...seats]));
    await event.save();
    
    res.json(event);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get attendees for a specific event
router.get('/:id/attendees', auth, async (req, res) => {
  try {
    const eventId = req.params.id;
    
    // First verify the event exists
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    // Get all bookings for this event
    const bookings = await Booking.find({ event: eventId })
      .populate('user', 'name email age gender location interests');
    
    // Map bookings to attendees with check-in status
    const attendees = bookings.map(booking => ({
      _id: booking.user._id,
      name: booking.user.name,
      email: booking.user.email,
      age: booking.user.age,
      gender: booking.user.gender,
      location: booking.user.location,
      interests: booking.user.interests,
      checkInStatus: booking.status === 'checked-in'
    }));
    
    res.json(attendees);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
