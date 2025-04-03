const express = require('express');
const {RecibeInfoExpressCheckout, updateTransaction, sendEmail, ConsultaEstadoTransaccion, Callback} = require('../controllers/ExpressCheckoutController');

const router = express.Router();

router.post('/payment', RecibeInfoExpressCheckout);
router.post('/update-tran', updateTransaction);
router.get('/send-email', sendEmail);
router.post('/webhook', Callback);


router.post('/check-transaction', ConsultaEstadoTransaccion);







module.exports = router;