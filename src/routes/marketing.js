import express from 'express';
import {
  check,
  validationResult,
  query as q,
  param,
  body,
} from 'express-validator';
import mongoose from 'mongoose';
import { auth, requireRole } from '../middleware/auth.js';
import MarketingCampaign from '../models/MarketingCampaign.js';
import EmailCampaign from '../models/EmailCampaign.js';
import SocialPost from '../models/SocialPost.js';
import MarketingStats from '../models/MarketingStats.js';
import Booking from '../models/Booking.js';
import {
  resolveSegmentQuery,
  recordEmailEvent,
  updateDailyStats,
  EmailProvider,
  SocialPublisher,
} from '../utils/marketingHelpers.js';

const router = express.Router();
const ObjectId = mongoose.Types.ObjectId;

// All marketing routes require auth and admin role
router.use(auth, requireRole('admin'));

/* ---------------------- CAMPAIGNS ROUTES ---------------------- */

/**
 * Get campaigns with pagination and filtering
 * GET /api/marketing/campaigns?eventId=&q=&status=&page=&limit=
 */
router.get(
  '/campaigns',
  [
    q('eventId').optional().isMongoId().withMessage('Invalid eventId'),
    q('q').optional().isString(),
    q('status')
      .optional()
      .isIn(['Active', 'Scheduled', 'Paused', 'Completed'])
      .withMessage('Invalid status'),
    q('page').optional().toInt().isInt({ min: 1 }).withMessage('Invalid page'),
    q('limit')
      .optional()
      .toInt()
      .isInt({ min: 1, max: 100 })
      .withMessage('Invalid limit'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        eventId,
        q: search,
        status,
        page = 1,
        limit = 10,
      } = req.query;

      const skip = (Number(page) - 1) * Number(limit);

      // Build filters
      const filters = { createdBy: req.user._id };

      if (eventId) {
        filters.eventId = new ObjectId(eventId);
      }

      if (status) {
        filters.status = status;
      }

      if (search) {
        filters.name = { $regex: String(search), $options: 'i' };
      }

      const total = await MarketingCampaign.countDocuments(filters);

      const campaigns = await MarketingCampaign.find(filters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('eventId', 'title date venue')
        .lean();

      // Attach latest stats (N+1, acceptable for small lists; can be optimized with aggregation if needed)
      const campaignsWithStats = await Promise.all(
        campaigns.map(async (campaign) => {
          const stats = await MarketingStats.findOne({
            campaignId: campaign._id,
          })
            .sort({ date: -1 })
            .lean();

          return {
            ...campaign,
            stats:
              stats || {
                reach: 0,
                conversions: 0,
                email: {},
                social: {},
              },
          };
        })
      );

      res.json({
        campaigns: campaignsWithStats,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      res.status(500).json({ message: 'Failed to fetch campaigns' });
    }
  }
);

/**
 * Create a new campaign
 * POST /api/marketing/campaigns
 */
router.post(
  '/campaigns',
  [
    check('name').notEmpty().withMessage('Campaign name is required'),
    check('startAt').isISO8601().withMessage('Valid start date is required'),
    check('endAt').isISO8601().withMessage('Valid end date is required'),
    check('eventId').optional().isMongoId().withMessage('Valid event ID is required'),
    check('budget').optional().isNumeric().withMessage('Budget must be a number'),
    check('target').optional().isObject().withMessage('Target must be an object'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { name, startAt, endAt, eventId, budget, target } = req.body;

      const start = new Date(startAt);
      const end = new Date(endAt);
      if (!(start instanceof Date) || isNaN(start)) {
        return res.status(400).json({ message: 'Invalid start date' });
      }
      if (!(end instanceof Date) || isNaN(end)) {
        return res.status(400).json({ message: 'Invalid end date' });
      }
      if (end <= start) {
        return res.status(400).json({ message: 'End date must be after start date' });
      }

      const campaign = new MarketingCampaign({
        name,
        startAt,
        endAt,
        eventId,
        budget,
        target,
        createdBy: req.user._id,
        status: start <= new Date() ? 'Active' : 'Scheduled',
      });

      await campaign.save();
      res.status(201).json(campaign);
    } catch (error) {
      console.error('Error creating campaign:', error);
      res.status(500).json({ message: 'Failed to create campaign' });
    }
  }
);

/**
 * Update a campaign
 * PUT /api/marketing/campaigns/:id
 */
router.put(
  '/campaigns/:id',
  [
    param('id').isMongoId().withMessage('Invalid campaign ID'),
    check('name').optional().notEmpty().withMessage('Campaign name cannot be empty'),
    check('startAt').optional().isISO8601().withMessage('Valid start date is required'),
    check('endAt').optional().isISO8601().withMessage('Valid end date is required'),
    check('eventId').optional().isMongoId().withMessage('Valid event ID is required'),
    check('budget').optional().isNumeric().withMessage('Budget must be a number'),
    check('target').optional().isObject().withMessage('Target must be an object'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { id } = req.params;
      const { name, startAt, endAt, eventId, budget, target } = req.body;

      const campaign = await MarketingCampaign.findById(id);
      if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found' });
      }

      if (campaign.createdBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'You do not have permission to update this campaign' });
      }

      if (name !== undefined) campaign.name = name;
      if (startAt !== undefined) campaign.startAt = startAt;
      if (endAt !== undefined) campaign.endAt = endAt;
      if (eventId !== undefined) campaign.eventId = eventId;
      if (budget !== undefined) campaign.budget = budget;
      if (target !== undefined) campaign.target = target;

      // Update status based on dates if not paused
      if (campaign.status !== 'Paused') {
        const now = new Date();
        const start = new Date(campaign.startAt);
        const end = new Date(campaign.endAt);

        if (now > end) {
          campaign.status = 'Completed';
        } else if (now >= start) {
          campaign.status = 'Active';
        } else {
          campaign.status = 'Scheduled';
        }
      }

      await campaign.save();
      res.json(campaign);
    } catch (error) {
      console.error('Error updating campaign:', error);
      res.status(500).json({ message: 'Failed to update campaign' });
    }
  }
);

/**
 * Delete a campaign
 * DELETE /api/marketing/campaigns/:id
 */
router.delete('/campaigns/:id', [param('id').isMongoId()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;

    const campaign = await MarketingCampaign.findById(id);
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    if (campaign.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You do not have permission to delete this campaign' });
    }

    await EmailCampaign.deleteMany({ campaignId: id });
    await SocialPost.deleteMany({ campaignId: id });
    await MarketingStats.deleteMany({ campaignId: id });

    await MarketingCampaign.deleteOne({ _id: id });

    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    res.status(500).json({ message: 'Failed to delete campaign' });
  }
});

/**
 * Pause a campaign
 * POST /api/marketing/campaigns/:id/pause
 */
router.post('/campaigns/:id/pause', [param('id').isMongoId()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const campaign = await MarketingCampaign.findById(id);
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    if (campaign.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You do not have permission to pause this campaign' });
    }

    if (campaign.status !== 'Active' && campaign.status !== 'Scheduled') {
      return res.status(400).json({ message: `Cannot pause a campaign with status: ${campaign.status}` });
    }

    campaign.status = 'Paused';
    await campaign.save();

    res.json(campaign);
  } catch (error) {
    console.error('Error pausing campaign:', error);
    res.status(500).json({ message: 'Failed to pause campaign' });
  }
});

/**
 * Activate a campaign
 * POST /api/marketing/campaigns/:id/activate
 */
router.post('/campaigns/:id/activate', [param('id').isMongoId()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const campaign = await MarketingCampaign.findById(id);
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    if (campaign.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You do not have permission to activate this campaign' });
    }

    if (campaign.status !== 'Paused') {
      return res.status(400).json({ message: `Cannot activate a campaign with status: ${campaign.status}` });
    }

    const now = new Date();
    const start = new Date(campaign.startAt);
    const end = new Date(campaign.endAt);

    if (now > end) {
      campaign.status = 'Completed';
    } else if (now >= start) {
      campaign.status = 'Active';
    } else {
      campaign.status = 'Scheduled';
    }

    await campaign.save();
    res.json(campaign);
  } catch (error) {
    console.error('Error activating campaign:', error);
    res.status(500).json({ message: 'Failed to activate campaign' });
  }
});

/* ---------------------- EMAIL CAMPAIGNS ROUTES ---------------------- */

/**
 * Get email campaigns
 * GET /api/marketing/email?campaignId=
 */
router.get(
  '/email',
  [q('campaignId').isMongoId().withMessage('Campaign ID is required')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { campaignId } = req.query;

      const campaign = await MarketingCampaign.findById(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found' });
      }

      if (campaign.createdBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'You do not have permission to view these emails' });
      }

      const emails = await EmailCampaign.find({ campaignId }).sort({ createdAt: -1 }).lean();
      res.json(emails);
    } catch (error) {
      console.error('Error fetching email campaigns:', error);
      res.status(500).json({ message: 'Failed to fetch email campaigns' });
    }
  }
);

/**
 * Get email campaign by ID
 * GET /api/marketing/email/:id
 */
router.get('/email/:id', [param('id').isMongoId()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;

    const email = await EmailCampaign.findById(id).populate('campaignId').lean();
    if (!email) {
      return res.status(404).json({ message: 'Email campaign not found' });
    }

    if (email.campaignId.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You do not have permission to view this email' });
    }

    if (email.segment) {
      const recipients = await resolveSegmentQuery(email.segment);
      email.recipientCount = recipients.length;
    }

    res.json(email);
  } catch (error) {
    console.error('Error fetching email campaign:', error);
    res.status(500).json({ message: 'Failed to fetch email campaign' });
  }
});

/**
 * Create email campaign
 * POST /api/marketing/email
 */
router.post(
  '/email',
  [
    check('campaignId').isMongoId().withMessage('Valid campaign ID is required'),
    check('subject').notEmpty().withMessage('Subject is required'),
    check('templateHtml').notEmpty().withMessage('Email template is required'),
    check('fromEmail').isEmail().withMessage('Valid from email is required'),
    check('segment').optional().isObject().withMessage('Segment must be an object'),
    check('provider')
      .optional()
      .isIn(['mock', 'sendgrid', 'mailgun'])
      .withMessage('Invalid provider'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { campaignId, subject, templateHtml, fromEmail, segment, provider } =
        req.body;

      const campaign = await MarketingCampaign.findById(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found' });
      }

      if (campaign.createdBy.toString() !== req.user._id.toString()) {
        return res
          .status(403)
          .json({ message: 'You do not have permission to add emails to this campaign' });
      }

      const recipients = await resolveSegmentQuery(segment || {});

      const email = new EmailCampaign({
        campaignId,
        subject,
        templateHtml,
        fromEmail,
        segment: segment || {},
        provider: provider || 'mock',
        recipientCount: recipients.length,
      });

      await email.save();
      res.status(201).json(email);
    } catch (error) {
      console.error('Error creating email campaign:', error);
      res.status(500).json({ message: 'Failed to create email campaign' });
    }
  }
);

/**
 * Update email campaign
 * PUT /api/marketing/email/:id
 */
router.put(
  '/email/:id',
  [
    param('id').isMongoId(),
    check('subject').optional().notEmpty().withMessage('Subject cannot be empty'),
    check('templateHtml').optional().notEmpty().withMessage('Email template cannot be empty'),
    check('fromEmail').optional().isEmail().withMessage('Valid from email is required'),
    check('segment').optional().isObject().withMessage('Segment must be an object'),
    check('provider')
      .optional()
      .isIn(['mock', 'sendgrid', 'mailgun'])
      .withMessage('Invalid provider'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { id } = req.params;
      const { subject, templateHtml, fromEmail, segment, provider } = req.body;

      const email = await EmailCampaign.findById(id).populate('campaignId');
      if (!email) {
        return res.status(404).json({ message: 'Email campaign not found' });
      }

      if (email.campaignId.createdBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'You do not have permission to update this email' });
      }

      if (email.status !== 'Draft') {
        return res.status(400).json({ message: 'Only draft emails can be updated' });
      }

      if (subject !== undefined) email.subject = subject;
      if (templateHtml !== undefined) email.templateHtml = templateHtml;
      if (fromEmail !== undefined) email.fromEmail = fromEmail;
      if (segment !== undefined) {
        email.segment = segment;
        const recipients = await resolveSegmentQuery(segment);
        email.recipientCount = recipients.length;
      }
      if (provider !== undefined) email.provider = provider;

      await email.save();
      res.json(email);
    } catch (error) {
      console.error('Error updating email campaign:', error);
      res.status(500).json({ message: 'Failed to update email campaign' });
    }
  }
);

/**
 * Send email campaign (queued, batched)
 * POST /api/marketing/email/:id/send
 */
router.post('/email/:id/send', [param('id').isMongoId()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;

    const email = await EmailCampaign.findById(id).populate('campaignId');
    if (!email) {
      return res.status(404).json({ message: 'Email campaign not found' });
    }

    if (email.campaignId.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You do not have permission to send this email' });
    }

    if (email.status !== 'Draft') {
      return res
        .status(400)
        .json({ message: `Cannot send an email with status: ${email.status}` });
    }

    const recipients = await resolveSegmentQuery(email.segment || {});
    if (recipients.length === 0) {
      return res.status(400).json({ message: 'No recipients match the segment criteria' });
    }

    email.status = 'Queued';
    email.nextBatchAt = new Date();
    await email.save();

    // Non-blocking send
    setTimeout(async () => {
      try {
        const BATCH_SIZE = 10;
        const batch = recipients.slice(0, BATCH_SIZE);
        const provider = EmailProvider.getProvider(email.provider);

        await EmailCampaign.findByIdAndUpdate(id, { status: 'Sending' });

        for (const recipient of batch) {
          await provider.sendEmail(email, recipient);
        }

        if (recipients.length > BATCH_SIZE) {
          const nextBatchAt = new Date();
          nextBatchAt.setMinutes(nextBatchAt.getMinutes() + 5);
          await EmailCampaign.findByIdAndUpdate(id, { nextBatchAt });
        } else {
          await EmailCampaign.findByIdAndUpdate(id, { status: 'Sent', nextBatchAt: null });
        }

        await updateDailyStats(email.campaignId._id);
      } catch (error) {
        console.error('Error sending email batch:', error);
        await EmailCampaign.findByIdAndUpdate(id, { status: 'Failed' });
      }
    }, 0);

    res.json({
      message: 'Email campaign queued for sending',
      recipientCount: recipients.length,
    });
  } catch (error) {
    console.error('Error sending email campaign:', error);
    res.status(500).json({ message: 'Failed to send email campaign' });
  }
});

/**
 * Track email open (pixel)
 * GET /api/marketing/email/:id/track/open?recipient=
 */
router.get('/email/:id/track/open', [param('id').isMongoId()], async (req, res) => {
  try {
    const { id } = req.params;
    const { recipient } = req.query;

    if (recipient) {
      try {
        await recordEmailEvent(id, recipient, 'open');
      } catch (e) {
        console.error('recordEmailEvent failed:', e);
      }
    }

    // Always send a 1x1 transparent pixel
    res.set('Content-Type', 'image/gif');
    res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
  } catch (error) {
    console.error('Error tracking email open:', error);
    res.set('Content-Type', 'image/gif');
    res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
  }
});

/**
 * Track email clicks
 * GET /api/marketing/email/tracking/:id/click?url=
 * (Public route semantics; but router is under auth. If truly public, mount before auth/use a separate router.)
 */
router.get(
  '/email/tracking/:id/click',
  [param('id').isMongoId(), q('url').isURL().withMessage('Invalid URL')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        // Even on validation error, try to redirect if url present to avoid broken links
        const fallbackUrl = req.query.url;
        if (fallbackUrl) return res.redirect(fallbackUrl);
        return res.status(400).json({ errors: errors.array() });
      }

      const campaignId = req.params.id;
      const { url } = req.query;

      await EmailCampaign.findByIdAndUpdate(campaignId, {
        $inc: { 'stats.clicks': 1 },
      });

      res.redirect(url);
    } catch (error) {
      console.error('Error tracking email click:', error);
      if (req.query.url) {
        return res.redirect(req.query.url);
      }
      res.status(500).json({ message: 'Failed to track click' });
    }
  }
);

/* ============== SOCIAL MEDIA ROUTES ============== */

/**
 * Get social media posts for a marketing campaign
 * GET /api/marketing/social?campaignId=
 */
router.get(
  '/social',
  [q('campaignId').isMongoId().withMessage('Campaign ID is required')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const campaign = await MarketingCampaign.findOne({
        _id: req.query.campaignId,
        createdBy: req.user._id,
      });

      if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found' });
      }

      const socialPosts = await SocialPost.find({
        campaignId: req.query.campaignId,
      })
        .sort({ scheduledAt: -1 })
        .lean();

      res.json(socialPosts);
    } catch (error) {
      console.error('Error fetching social posts:', error);
      res.status(500).json({ message: 'Failed to fetch social posts' });
    }
  }
);

/**
 * Create a new social media post
 * POST /api/marketing/social
 */
router.post(
  '/social',
  [
    body('campaignId').isMongoId().withMessage('Marketing campaign ID is required'),
    body('platform')
      .isIn(['facebook', 'twitter', 'instagram'])
      .withMessage('Valid platform is required'),
    body('content').notEmpty().withMessage('Content is required'),
    body('scheduledAt').isISO8601().withMessage('Scheduled date must be a valid ISO 8601 date'),
    body('linkUrl').optional().isURL().withMessage('Link URL must be a valid URL'),
    body('imageUrl').optional().isURL().withMessage('Image URL must be a valid URL'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const campaign = await MarketingCampaign.findOne({
        _id: req.body.campaignId,
        createdBy: req.user._id,
      });

      if (!campaign) {
        return res.status(404).json({ message: 'Marketing campaign not found' });
      }

      const socialPost = new SocialPost({
        campaignId: req.body.campaignId,
        platform: req.body.platform,
        content: req.body.content,
        scheduledAt: req.body.scheduledAt,
        linkUrl: req.body.linkUrl,
        imageUrl: req.body.imageUrl,
        status: 'Draft',
      });

      await socialPost.save();
      res.status(201).json(socialPost);
    } catch (error) {
      console.error('Error creating social post:', error);
      res.status(500).json({ message: 'Failed to create social post' });
    }
  }
);

/**
 * Update a social media post
 * PUT /api/marketing/social/:id
 */
router.put(
  '/social/:id',
  [
    param('id').isMongoId().withMessage('Invalid social post ID'),
    body('platform')
      .optional()
      .isIn(['facebook', 'twitter', 'instagram'])
      .withMessage('Valid platform is required'),
    body('content').optional().notEmpty().withMessage('Content cannot be empty'),
    body('scheduledAt').optional().isISO8601().withMessage('Scheduled date must be a valid ISO 8601 date'),
    body('linkUrl').optional().isURL().withMessage('Link URL must be a valid URL'),
    body('imageUrl').optional().isURL().withMessage('Image URL must be a valid URL'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const socialPost = await SocialPost.findById(req.params.id).populate('campaignId');
      if (!socialPost) {
        return res.status(404).json({ message: 'Social post not found' });
      }

      if (socialPost.campaignId.createdBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Unauthorized' });
      }

      if (socialPost.status !== 'Draft') {
        return res
          .status(400)
          .json({ message: `Cannot update social post with status: ${socialPost.status}` });
      }

      const fieldsToUpdate = ['platform', 'content', 'scheduledAt', 'linkUrl', 'imageUrl'];
      fieldsToUpdate.forEach((field) => {
        if (req.body[field] !== undefined) {
          socialPost[field] = req.body[field];
        }
      });

      await socialPost.save();
      res.json(socialPost);
    } catch (error) {
      console.error('Error updating social post:', error);
      res.status(500).json({ message: 'Failed to update social post' });
    }
  }
);

/**
 * Delete a social media post
 * DELETE /api/marketing/social/:id
 */
router.delete('/social/:id', [param('id').isMongoId()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const socialPost = await SocialPost.findById(req.params.id).populate('campaignId');
    if (!socialPost) {
      return res.status(404).json({ message: 'Social post not found' });
    }

    if (socialPost.campaignId.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (socialPost.status !== 'Draft') {
      return res
        .status(400)
        .json({ message: `Cannot delete social post with status: ${socialPost.status}` });
    }

    await SocialPost.deleteOne({ _id: socialPost._id });
    res.json({ message: 'Social post deleted successfully' });
  } catch (error) {
    console.error('Error deleting social post:', error);
    res.status(500).json({ message: 'Failed to delete social post' });
  }
});

/**
 * Schedule a social media post
 * POST /api/marketing/social/:id/schedule
 */
router.post('/social/:id/schedule', [param('id').isMongoId()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const socialPost = await SocialPost.findById(req.params.id).populate('campaignId');
    if (!socialPost) {
      return res.status(404).json({ message: 'Social post not found' });
    }

    if (socialPost.campaignId.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (socialPost.status !== 'Draft') {
      return res
        .status(400)
        .json({ message: `Cannot schedule social post with status: ${socialPost.status}` });
    }

    if (socialPost.campaignId.status !== 'Active') {
      return res.status(400).json({
        message: `Cannot schedule post for campaign with status: ${socialPost.campaignId.status}`,
      });
    }

    // Ensure scheduledAt is in the future
    const now = new Date();
    if (!socialPost.scheduledAt || new Date(socialPost.scheduledAt) <= now) {
      socialPost.scheduledAt = new Date(now.getTime() + 60_000); // 1 minute from now
    }

    socialPost.status = 'Queued';
    await socialPost.save();

    // Optional handoff to a publisher if available
    try {
      if (SocialPublisher && typeof SocialPublisher.enqueue === 'function') {
        await SocialPublisher.enqueue(socialPost);
      }
    } catch (pubErr) {
      // Do not fail the API if the async publisher hookup fails
      console.warn('SocialPublisher enqueue failed:', pubErr?.message || pubErr);
    }

    res.json({
      message: 'Social post scheduled successfully',
      socialPost,
    });
  } catch (error) {
    console.error('Error scheduling social post:', error);
    res.status(500).json({ message: 'Failed to schedule social post' });
  }
});

/* ============== ANALYTICS ROUTES ============== */

/**
 * Get summary analytics for a marketing campaign or all campaigns for the user (today)
 * GET /api/marketing/analytics/summary?campaignId=
 */
router.get(
  '/analytics/summary',
  [q('campaignId').optional().isMongoId().withMessage('Invalid campaign ID')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { campaignId } = req.query;
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      if (campaignId) {
        const campaign = await MarketingCampaign.findOne({
          _id: campaignId,
          createdBy: req.user._id,
        });
        if (!campaign) {
          return res.status(404).json({ message: 'Campaign not found' });
        }

        const stats = await MarketingStats.findOne({
          campaignId,
          date: today,
        }).lean();

        return res.json(
          stats || {
            campaignId,
            date: today,
            reach: 0,
            conversions: 0,
            revenue: 0,
            email: { sent: 0, delivered: 0, opens: 0, clicks: 0, bounces: 0 },
            social: { impressions: 0, clicks: 0, engagements: 0 },
          }
        );
      }

      const campaigns = await MarketingCampaign.find({
        createdBy: req.user._id,
      }).lean();

      const campaignIds = campaigns.map((c) => c._id);

      const stats = await MarketingStats.find({
        campaignId: { $in: campaignIds },
        date: today,
      }).lean();

      const summary = {
        totalReach: 0,
        totalConversions: 0,
        totalRevenue: 0,
        email: {
          sent: 0,
          delivered: 0,
          opens: 0,
          clicks: 0,
          bounces: 0,
        },
        social: {
          impressions: 0,
          clicks: 0,
          engagements: 0,
        },
      };

      stats.forEach((stat) => {
        summary.totalReach += stat.reach || 0;
        summary.totalConversions += stat.conversions || 0;
        summary.totalRevenue += stat.revenue || 0;

        summary.email.sent += stat.email?.sent || 0;
        summary.email.delivered += stat.email?.delivered || 0;
        summary.email.opens += stat.email?.opens || 0;
        summary.email.clicks += stat.email?.clicks || 0;
        summary.email.bounces += stat.email?.bounces || 0;

        summary.social.impressions += stat.social?.impressions || 0;
        summary.social.clicks += stat.social?.clicks || 0;
        summary.social.engagements += stat.social?.engagements || 0;
      });

      res.json(summary);
    } catch (error) {
      console.error('Error fetching analytics summary:', error);
      res.status(500).json({ message: 'Failed to fetch analytics summary' });
    }
  }
);

/**
 * Get time series analytics for a marketing campaign
 * GET /api/marketing/analytics/timeseries?campaignId=&from=&to=
 */
router.get(
  '/analytics/timeseries',
  [
    q('campaignId').isMongoId().withMessage('Campaign ID is required'),
    q('from').optional().isISO8601().withMessage('From date must be a valid ISO 8601 date'),
    q('to').optional().isISO8601().withMessage('To date must be a valid ISO 8601 date'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { campaignId, from, to } = req.query;

      const campaign = await MarketingCampaign.findOne({
        _id: campaignId,
        createdBy: req.user._id,
      }).lean();

      if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found' });
      }

      const filter = { campaignId };

      if (from || to) {
        filter.date = {};
        if (from) {
          const fromDate = new Date(from);
          filter.date.$gte = fromDate.toISOString().split('T')[0];
        }
        if (to) {
          const toDate = new Date(to);
          filter.date.$lte = toDate.toISOString().split('T')[0];
        }
      }

      const stats = await MarketingStats.find(filter).sort({ date: 1 }).lean();

      const timeseries = stats.map((stat) => ({
        date: stat.date,
        reach: stat.reach || 0,
        conversions: stat.conversions || 0,
        revenue: stat.revenue || 0,
        email: {
          sent: stat.email?.sent || 0,
          delivered: stat.email?.delivered || 0,
          opens: stat.email?.opens || 0,
          clicks: stat.email?.clicks || 0,
        },
        social: {
          impressions: stat.social?.impressions || 0,
          clicks: stat.social?.clicks || 0,
        },
      }));

      res.json(timeseries);
    } catch (error) {
      console.error('Error fetching analytics timeseries:', error);
      res.status(500).json({ message: 'Failed to fetch analytics timeseries' });
    }
  }
);

export default router;
