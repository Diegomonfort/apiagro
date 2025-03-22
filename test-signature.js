const { loadPrivateKeyFromPfx } = require('./utils/plexo.utils');
const moment = require('moment');
const { createSign } = require('crypto');
const axios = require('axios');

const canonicalize = (obj) => {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(canonicalize);
  const sortedObj = {};
  Object.keys(obj).sort().forEach(key => {
    sortedObj[key] = canonicalize(obj[key]);
  });
  return sortedObj;
};

const testExpressCheckout = async () => {
  try {
    const privateKey = loadPrivateKeyFromPfx();

    const innerObject = {
      Client: "AgrojardinTest",
      Request: {
        AuthorizationData: { 
          Action: 64,
          ClientInformation: {
            Name: "Diego",
            Address: "AvItalia2020",
            Email: "diego@test.com",
          },
          DoNotUseCallback: true,
          LimitBanks: ["113", "137"],
          LimitIssuers: ["4", "11"],
          MetaReference: "diego@test.com",
          OptionalCommerceId: 12285,
          RedirectUri: "http://localhost/miURL",
          Type: 0
        },
        PaymentData: { 
          ClientReferenceId: "1617812571899",
          CurrencyId: 1,
          FinancialInclusion: {
            BilledAmount: parseFloat((100.0).toFixed(2)),
            InvoiceNumber: -1390098693,
            TaxedAmount: parseFloat((81.97).toFixed(1)),
            Type: 1
          },
          Installments: 1,
          Items: [
            {
              Amount: parseFloat((61.0).toFixed(2)),
              ClientItemReferenceId: "Item-1",
              Description: "2mtsx2mts",
              Name: "SommierKing",
              Quantity: 1
            },
            {
              Amount: parseFloat((61.0).toFixed(2)),
              ClientItemReferenceId: "Item-2",
              Description: "PremiumCollection",
              Name: "SabanasKing",
              Quantity: 1
            }
          ],
          OptionalCommerceId: 12285,
          PaymentInstrumentInput: {
            NonStorableItems: {
              CVC: "123"
            },
            OptionalInstrumentFields: {
              CommerceReserveExpirationInSeconds: "600",
              ShippingAddress: "AvPeru2355",
              ShippingZipCode: "15800",
              ShippingCity: "Canelones",
              ShippingCountry: "UY",
              ShippingFirstName: "Juana",
              ShippingLastName: "Perez",
              ShippingPhoneNumber: "099554554"
            },
            UseExtendedClientCreditIfAvailable: false
          }
        }
      }
    };

    // 2. Payload a firmar
    const fingerprint = "579F4609DD4315D890921F47293B0E7CAC6CB290";
    const expirationTime = moment().add(1, 'hour').valueOf();

    const payloadToSign = {
      Fingerprint: fingerprint,
      Object: canonicalize(innerObject),
      UTCUnixTimeExpiration: expirationTime
    };

    // Serializar y modificar para añadir .0
    let jsonString = JSON.stringify(payloadToSign, null, 0).replace(/\s+/g, '');
    console.log('JSON a Firmar (original):', jsonString);

    // Añadir .0 a campos específicos usando regex
    jsonString = jsonString
      .replace(/"BilledAmount":(\d+)(,|})/g, '"BilledAmount":$1.0$2')
      .replace(/"TaxedAmount":(\d+)(,|})/g, '"TaxedAmount":$1.0$2')
      .replace(/"Amount":(\d+)(,|})/g, '"Amount":$1.0$2');

    console.log('JSON a Firmar (modificado):', jsonString);

    // 3. Generar firma con el JSON modificado
    const sign = createSign('SHA512');
    sign.update(jsonString);
    const signature = sign.sign({
      key: privateKey,
      padding: require('crypto').constants.RSA_PKCS1_PADDING
    }, 'base64');

    // 4. Construir payload final como cadena JSON manualmente
    const finalPayloadJson = `{"Object":${jsonString},"Signature":"${signature}"}`;

    // 5. Enviar a Plexo
    const response = await axios.post(
      'https://testing.plexo.com.uy:4043/SecurePaymentGateway.svc/ExpressCheckout',
      finalPayloadJson,
      { headers: { 'Content-Type': 'application/json' } }
    );

    console.log('✅ Respuesta:', JSON.stringify(response.data, null, 2));

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
};

testExpressCheckout();