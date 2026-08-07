const express = require('express');
const router = express.Router();
const wineryController = require('../controllers/winery.controller');
const { authMiddleware: protect, requireRole } = require('../middleware/authMiddleware');

// Base: /api/winery

// Full Profile
router.get('/full', protect, wineryController.getWinery);
router.put('/', protect, requireRole(['manager', 'admin']), wineryController.updateOverview);
router.put('/brand', protect, requireRole(['manager', 'admin']), wineryController.updateBrand);
router.put('/bookings-config', protect, requireRole(['manager', 'admin']), wineryController.updateBookingsConfig);
router.put('/policy-profile', protect, requireRole(['manager', 'admin']), wineryController.updatePolicyProfile);
router.put('/integration-config', protect, requireRole(['manager', 'admin']), wineryController.updateIntegrationConfig);
router.post('/integration-config/test', protect, requireRole(['manager', 'admin']), wineryController.testIntegrationConnection);
router.post('/integration-config/email/sync', protect, requireRole(['manager', 'admin']), wineryController.syncEmailNow);
router.put('/settings', protect, requireRole(['manager', 'admin']), wineryController.updateSettings);

// Area-owned configuration. Permission is based on area MANAGER membership.
router.put('/areas/:areaId/profile', protect, wineryController.updateAreaProfile);
router.put('/areas/:areaId/bookings-config', protect, wineryController.updateAreaBookingsConfig);
router.put('/areas/:areaId/products/:productId', protect, wineryController.updateAreaProductListing);
router.delete('/areas/:areaId/products/:productId', protect, wineryController.deleteAreaProductListing);
router.put('/areas/:areaId/integration-config', protect, wineryController.updateAreaIntegrationConfig);
router.delete('/areas/:areaId/integration-config/:domain', protect, wineryController.deleteAreaIntegrationDomain);
router.post('/areas/:areaId/integration-config/test', protect, wineryController.testAreaIntegrationConnection);

// Products
router.post('/products', protect, requireRole(['manager', 'admin']), wineryController.createProduct);
router.put('/products/:id', protect, requireRole(['manager', 'admin']), wineryController.updateProduct);
router.delete('/products/:id', protect, requireRole(['manager', 'admin']), wineryController.deleteProduct);

// Booking Types
router.post('/bookings/types', protect, wineryController.createBookingType);
router.put('/bookings/types/:id', protect, wineryController.updateBookingType);
router.delete('/bookings/types/:id', protect, wineryController.deleteBookingType);

// FAQs (formerly Policies)
router.post('/faqs', protect, wineryController.createFAQ);
router.put('/faqs/:id', protect, wineryController.updateFAQ);
router.delete('/faqs/:id', protect, wineryController.deleteFAQ);

// SOPs
router.post('/sops', protect, wineryController.createSop);
router.put('/sops/:id', protect, wineryController.updateSop);
router.delete('/sops/:id', protect, wineryController.deleteSop);
// Contacts
router.post('/contacts', protect, wineryController.createContact);
router.put('/contacts/:id', protect, wineryController.updateContact);
router.delete('/contacts/:id', protect, wineryController.deleteContact);

module.exports = router;
