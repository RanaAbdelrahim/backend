import express from 'express';
import { auth } from '../middleware/auth.js';
import Notification from '../models/Notification.js';

const router = express.Router();

router.get('/', auth, async (req, res) => {
  const notes = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
  res.json(notes);
});

router.post('/', auth, async (req, res) => {
  const note = await Notification.create({ user: req.user._id, message: req.body.message, link: req.body.link });
  res.status(201).json(note);
});

router.post('/:id/read', auth, async (req, res) => {
  const note = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { read: true }, { new: true });
  res.json(note);
});

export default router;
