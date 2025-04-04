const express = require('express');
const {RecibeInfoExpressCheckout, updateTransaction, sendEmail, ConsultaEstadoTransaccion, Callback, verifyPayment} = require('../controllers/ExpressCheckoutController');

const router = express.Router();

router.post('/payment', RecibeInfoExpressCheckout);
router.post('/update-tran', updateTransaction);
router.get('/send-email', sendEmail);
router.post('/webhook', Callback);
router.get('/verify-payment', verifyPayment);



router.post('/check-transaction', ConsultaEstadoTransaccion);







module.exports = router;