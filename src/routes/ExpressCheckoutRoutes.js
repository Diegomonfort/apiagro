const express = require('express');
const {RecibeInfoExpressCheckout, updateTransaction, sendEmail, ConsultaEstadoTransaccion} = require('../controllers/ExpressCheckoutController');

const router = express.Router();

router.post('/payment', RecibeInfoExpressCheckout);
router.post('/update-tran', updateTransaction);
router.get('/send-email', sendEmail);

router.post('/check-transaction', ConsultaEstadoTransaccion);







module.exports = router;