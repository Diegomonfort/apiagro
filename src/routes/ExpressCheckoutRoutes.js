const express = require('express');
const {RecibeInfoExpressCheckout, updateTransaction, sendEmail} = require('../controllers/ExpressCheckoutController');

const router = express.Router();

router.post('/payment', RecibeInfoExpressCheckout);
router.post('/update-tran', updateTransaction);
router.get('/send-email', sendEmail);






module.exports = router;