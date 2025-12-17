const express = require('express');
const router = express.Router();
const wineryController = require('../controllers/winery.controller');
const { protect, authorize } = require('../middleware/authMiddleware');

// Base: /api/winery

// Full Profile
router.get('/full', protect, authorize('manager', 'admin'), wineryController.getWinery);
router.put('/', protect, authorize('manager', 'admin'), wineryController.updateWinery);

// Products
router.post('/products', protect, authorize('manager', 'admin'), wineryController.createProduct);
router.delete('/products/:id', protect, authorize('manager', 'admin'), wineryController.deleteProduct);

// Policies
router.post('/policies', protect, authorize('manager', 'admin'), wineryController.createPolicy);
router.delete('/policies/:id', protect, authorize('manager', 'admin'), wineryController.deletePolicy);

module.exports = router;
