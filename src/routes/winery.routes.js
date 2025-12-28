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

module.exports = router;
