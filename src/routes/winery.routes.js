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

// Products
router.post('/products', protect, requireRole(['manager', 'admin']), wineryController.createProduct);
router.delete('/products/:id', protect, requireRole(['manager', 'admin']), wineryController.deleteProduct);

// FAQs (formerly Policies)
router.post('/faqs', protect, requireRole(['manager', 'admin']), wineryController.createFAQ);
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
