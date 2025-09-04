import express from 'express';
import QRCode from 'qrcode';
import mongoose from 'mongoose';
import { auth, requireRole } from '../middleware/auth.js';
import Event from '../models/Event.js';
import Booking from '../models/Booking.js';
import Notification from '../models/Notification.js';
import XLSX from 'xlsx';

const router = express.Router();

// Book seats - with transaction to ensure atomicity
router.post('/:eventId', auth, async (req, res) => {
  // Start a session for the transaction
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { seats } = req.body;
    
    if (!seats || !Array.isArray(seats) || seats.length === 0) {
      return res.status(400).json({ message: 'Seat selection is required' });
    }
    
    const event = await Event.findById(req.params.eventId).session(session);
    if (!event) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Event not found' });
    }
    
    if (event.status === 'closed') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Event is closed for bookings' });
    }
    
    // Verify all seats are available
    const allUsed = new Set([...(event.seatMap.sold || []), ...(event.seatMap.reserved || [])]);
    const unavailable = seats.filter(s => allUsed.has(s));
    
    if (unavailable.length > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        message: `Seats ${unavailable.join(', ')} are no longer available`
      });
    }

    // Simulated payment: assume success
    const pricePaid = (event.price || 0) * (seats?.length || 0);
    const qrPayload = {
      userId: req.user._id,
      eventId: String(event._id),
      seats,
      ts: Date.now()
    };
    const qrData = await QRCode.toDataURL(JSON.stringify(qrPayload));

    // Extract UTM source from referrer if available
    let sourceCampaign = null;
    let referrer = null;
    
    // Check headers for referrer
    if (req.headers.referer) {
      referrer = req.headers.referer;
      const url = new URL(req.headers.referer);
      sourceCampaign = url.searchParams.get('utm_campaign');
    }
    
    // Also check body for utm_campaign (for API calls)
    if (!sourceCampaign && req.body.utm_campaign) {
      sourceCampaign = req.body.utm_campaign;
    }

    // Create booking
    const booking = await Booking.create([{ 
      user: req.user._id, 
      event: event._id, 
      seats, 
      pricePaid, 
      status: 'paid', 
      qrData,
      sourceCampaign,
      referrer
    }], { session });

    // Update event seats (mark as sold)
    event.seatMap.sold = [...(event.seatMap.sold || []), ...seats];
    await event.save({ session });
    
    // Create notification
    await Notification.create([{
      user: req.user._id,
      message: `Your booking for ${event.title} is confirmed!`,
      link: `/me/tickets`
    }], { session });

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    // Return the booking info
    res.status(201).json(booking[0]);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Booking error:', err);
    res.status(500).json({ message: 'Failed to complete booking: ' + err.message });
  }
});

// My bookings
router.get('/me', auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user._id })
      .populate('event')
      .sort({ createdAt: -1 })
      .lean();
    
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Verify QR (check-in)
router.post('/checkin/:bookingId', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    
    // Only allow checkin of paid bookings
    if (booking.status !== 'paid') {
      return res.status(400).json({ 
        message: `Cannot check in booking with status: ${booking.status}`
      });
    }
    
    booking.status = 'checked-in';
    booking.checkInTime = new Date();
    await booking.save();
    
    res.json({ ok: true, booking });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// NEW ROUTE: Get all bookings (admin only)
router.get('/all', auth, requireRole('admin'), async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate('event', 'title')
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// NEW ROUTE: Update booking status (admin only)
router.put('/:bookingId/status', auth, requireRole('admin'), async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['pending', 'paid', 'confirmed', 'cancelled', 'checked-in'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }
    
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    
    booking.status = status;
    
    // Add check-in time if status is checked-in
    if (status === 'checked-in') {
      booking.checkInTime = new Date();
    }
    
    await booking.save();
    
    // Create notification for the user
    await Notification.create({
      user: booking.user,
      message: `Your booking status has been updated to: ${status}`,
      link: `/me/tickets`
    });
    
    res.json({ ok: true, booking });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// NEW ROUTE: Export bookings as Excel (admin only)
router.get('/export', auth, requireRole('admin'), async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate('event', 'title date venue price')
      .populate('user', 'name email')
      .lean();
    
    // Transform data for export
    const data = bookings.map(booking => ({
      BookingID: booking._id.toString(),
      Event: booking.event.title,
      Customer: booking.user.name,
      Email: booking.user.email,
      Seats: booking.seats.join(', '),
      PricePaid: booking.pricePaid,
      Status: booking.status,
      CreatedAt: new Date(booking.createdAt).toLocaleString(),
      CheckedIn: booking.checkInTime ? new Date(booking.checkInTime).toLocaleString() : 'Not checked in'
    }));
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Bookings');
    
    // Generate buffer
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    // Set headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="bookings_export.xlsx"');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
