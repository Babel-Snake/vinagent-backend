const express = require('express');
const router = express.Router();
const wineryController = require('../controllers/winery.controller');
const { authMiddleware: protect, requireRole } = require('../middleware/authMiddleware');

// Base: /api/winery

// Full Profile
router.get('/full', protect, requireRole(['manager', 'admin']), wineryController.getWinery);
router.put('/', protect, requireRole(['manager', 'admin']), wineryController.updateOverview);
router.put('/brand', protect, requireRole(['manager', 'admin']), wineryController.updateBrand);
router.put('/bookings-config', protect, requireRole(['manager', 'admin']), wineryController.updateBookingsConfig);
router.put('/policy-profile', protect, requireRole(['manager', 'admin']), wineryController.updatePolicyProfile);
router.put('/integration-config', protect, requireRole(['manager', 'admin']), wineryController.updateIntegrationConfig);
router.post('/integration-config/test', protect, requireRole(['manager', 'admin']), wineryController.testIntegrationConnection);
router.post('/integration-config/email/sync', protect, requireRole(['manager', 'admin']), wineryController.syncEmailNow);
router.put('/settings', protect, requireRole(['manager', 'admin']), wineryController.updateSettings);

// Products
router.post('/products', protect, requireRole(['manager', 'admin']), wineryController.createProduct);
router.put('/products/:id', protect, requireRole(['manager', 'admin']), wineryController.updateProduct);
router.delete('/products/:id', protect, requireRole(['manager', 'admin']), wineryController.deleteProduct);

// Booking Types
router.post('/bookings/types', protect, requireRole(['manager', 'admin']), wineryController.createBookingType);
router.put('/bookings/types/:id', protect, requireRole(['manager', 'admin']), wineryController.updateBookingType);
router.delete('/bookings/types/:id', protect, requireRole(['manager', 'admin']), wineryController.deleteBookingType);

// FAQs (formerly Policies)
router.post('/faqs', protect, requireRole(['manager', 'admin']), wineryController.createFAQ);
router.put('/faqs/:id', protect, requireRole(['manager', 'admin']), wineryController.updateFAQ);
router.delete('/faqs/:id', protect, requireRole(['manager', 'admin']), wineryController.deleteFAQ);

// SOPs
router.post('/sops', protect, requireRole(['manager', 'admin']), wineryController.createSop);
router.put('/sops/:id', protect, requireRole(['manager', 'admin']), wineryController.updateSop);
router.delete('/sops/:id', protect, requireRole(['manager', 'admin']), wineryController.deleteSop);
// Contacts
router.post('/contacts', protect, requireRole(['manager', 'admin']), wineryController.createContact);
router.put('/contacts/:id', protect, requireRole(['manager', 'admin']), wineryController.updateContact);
router.delete('/contacts/:id', protect, requireRole(['manager', 'admin']), wineryController.deleteContact);

module.exports = router;
