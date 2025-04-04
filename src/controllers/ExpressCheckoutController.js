const { loadPrivateKeyFromPfx } = require("../../utils/plexo.utils");
const moment = require("moment");
const { createSign } = require("crypto");
const axios = require("axios");
const supabase = require("../config/supabase");
const SibApiV3Sdk = require('sib-api-v3-sdk');
const defaultClient = SibApiV3Sdk.ApiClient.instance;

const canonicalize = (obj) => {
  if (typeof obj !== "object" || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(canonicalize);
  const sortedObj = {};
  Object.keys(obj)
    .sort()
    .forEach((key) => {
      sortedObj[key] = canonicalize(obj[key]);
    });
  return sortedObj;
};

const RecibeInfoExpressCheckout = async (req, res) => {
  try {
    const { datosPersonales, direccionEnvio, products } = req.body;

    if (!datosPersonales || !direccionEnvio || !products || !Array.isArray(products)) {
      return res.status(400).json({ error: "Faltan datos requeridos o la estructura de datos es incorrecta." });
    }

    // Consultar los productos en Supabase
    const { data: productos, error } = await supabase
      .from("productos")
      .select("id, Precio, Descripción, Producto")
      .in("id", products);

    if (error) {
      console.error("❌ Error al consultar productos en Supabase:", error);
      return res.status(500).json({ error: "Error al obtener información de los productos." });
    }

    if (!productos.length) {
      return res.status(400).json({ error: "Los productos seleccionados no existen." });
    }

    // Construcción de los items con la información de Supabase
    const itemsArray = productos.map((producto) => ({
      Amount: parseFloat(producto.Precio.toFixed(2)),
      ClientItemReferenceId: `Item-${producto.id}`,
      Name: `${producto.Producto}`,
      Quantity: 1, // Cantidad fija por ahora
    }));

    // 1️⃣ Guardar la transacción en la base de datos con estado "pendiente"
    const totalCompra = productos.reduce((acc, producto) => acc + producto.Precio, 0);

    // Insertar la transacción en la base de datos con los productos y el total
    const { data: nuevaTransaccion, error: errorTransaccion } = await supabase
      .from("transacciones")
      .insert([
        {
          departamento: direccionEnvio.ciudad,
          codigo_postal: direccionEnvio.codigoPostal,
          email: datosPersonales.email,
          celular: datosPersonales.telefono,
          nombre_completo: `${direccionEnvio.nombre} ${direccionEnvio.apellido}`,
          productos: products, // Guardar array de IDs de productos
          total: totalCompra, // Guardar el total de la compra
          estado: 2,
          direccion: direccionEnvio.direccion
        },
      ])
      .select("id")
      .single(); 

    if (errorTransaccion) {
      console.error("❌ Error al guardar la transacción:", errorTransaccion);
      return res.status(500).json({ error: "Error al registrar la transacción." });
    }

    console.log("✅ Transacción registrada con ID:", nuevaTransaccion.id);

    const privateKey = loadPrivateKeyFromPfx();

    const innerObject = {
      Client: "AgrojardinTest",
      Request: {
        AuthorizationData: {
          Action: 64,
          ClientInformation: {
            Name: direccionEnvio.nombre,
            LastName: direccionEnvio.apellido,
            Address: direccionEnvio.direccion,
            Email: datosPersonales.email,
          },
          DoNotUseCallback: true,
          LimitBanks: ["113", "137"],
          LimitIssuers: ["4", "11"],
          MetaReference: datosPersonales.email,
          OptionalCommerceId: 12285,
          RedirectUri: "https://agrojardin.vercel.app/verify",
          Type: 0,
        },
        PaymentData: {
          ClientReferenceId: nuevaTransaccion.id.toString(), // Usamos el ID de la transacción
          CurrencyId: 2,
          FinancialInclusion: {
            BilledAmount: parseFloat(itemsArray.reduce((acc, item) => acc + item.Amount, 0).toFixed(2)),
            InvoiceNumber: -1390098693,
            TaxedAmount: parseFloat(itemsArray.reduce((acc, item) => acc + item.Amount * 0.9, 0).toFixed(1)), // Asumiendo 10% de impuestos
            Type: 1,
          },
          Installments: 1,
          Items: itemsArray,
          OptionalCommerceId: 12285,
          PaymentInstrumentInput: {
            NonStorableItems: {
              CVC: "123",
            },
            OptionalInstrumentFields: {
              ShippingAddress: direccionEnvio.direccion,
              ShippingZipCode: direccionEnvio.codigoPostal,
              ShippingCity: direccionEnvio.ciudad,
              ShippingCountry: "UY",
              ShippingFirstName: direccionEnvio.nombre,
              ShippingLastName: direccionEnvio.apellido,
              ShippingPhoneNumber: datosPersonales.telefono,
            },
            UseExtendedClientCreditIfAvailable: false,
          },
        },
      },
    };

    const fingerprint = "579F4609DD4315D890921F47293B0E7CAC6CB290";
    const expirationTime = moment().add(1, "hour").valueOf();

    const payloadToSign = {
      Fingerprint: fingerprint,
      Object: canonicalize(innerObject),
      UTCUnixTimeExpiration: expirationTime,
    };

    let jsonString = JSON.stringify(payloadToSign, null, 0).replace(/\s+/g, "");

    jsonString = jsonString
      .replace(/"BilledAmount":(\d+)(,|})/g, '"BilledAmount":$1.0$2')
      .replace(/"TaxedAmount":(\d+)(,|})/g, '"TaxedAmount":$1.0$2')
      .replace(/"Amount":(\d+)(,|})/g, '"Amount":$1.0$2');

    const sign = createSign("SHA512");
    sign.update(jsonString);
    const signature = sign.sign(
      {
        key: privateKey,
        padding: require("crypto").constants.RSA_PKCS1_PADDING,
      },
      "base64"
    );

    const finalPayloadJson = `{"Object":${jsonString},"Signature":"${signature}"}`;

    const response = await axios.post(
      "https://testing.plexo.com.uy:4043/SecurePaymentGateway.svc/ExpressCheckout",
      finalPayloadJson,
      { headers: { "Content-Type": "application/json" } }
    );

    console.log("✅ Respuesta de pasarela:", JSON.stringify(response.data, null, 2));

    return res.status(200).json({
      ...response.data,
      transaccionId: nuevaTransaccion.id, // Enviamos el ID para referencia futura
    });

  } catch (error) {
    console.error("❌ Error en el proceso de pago:", error.response?.data || error.message);
    return res.status(500).json({ error: "Error en el procesamiento del pago." });
  }
};





const updateTransaction = async (req, res) => {
  const { id } = req.query; 
  const { status } = req.body; 

  try {
      // Actualizar el estado de la transacción
      const { data, error } = await supabase
          .from('transacciones')
          .update({ estado: status })
          .eq('id', id);

      if (error) {
          console.error('Error al actualizar la transacción:', error.message);
          return res.status(500).json({ error: 'Error al actualizar la transacción.' });
      }

      res.status(200).json({ message: 'Transacción actualizada correctamente', data });
  } catch (error) {
      console.error('Error general:', error.message);
      res.status(500).json({ error: 'Error al actualizar la transacción.' });
  }
};

const sendEmail = async (req, res) => {
  const { transaccion_id } = req.query;

  if (!transaccion_id) {
    return res.status(400).json({ error: 'Falta el transaccion_id' });
  }

  try {
    // 1️⃣ Obtener datos de la transacción
    const { data: transaccion, error } = await supabase
      .from('transacciones')
      .select('*')
      .eq('id', transaccion_id)
      .single();

    if (error || !transaccion) {
      return res.status(404).json({ error: 'Transacción no encontrada' });
    }

    // 2️⃣ Obtener información de los productos
    const { data: productos, error: productosError } = await supabase
      .from('productos') // Asegúrate que este sea el nombre correcto de tu tabla
      .select('Producto, Precio')
      .in('id', transaccion.productos);

    if (productosError) {
      console.error('Error al obtener productos:', productosError);
      return res.status(500).json({ error: 'Error al obtener información de productos' });
    }

    // 3️⃣ Configurar API Key de Brevo
    const apiKey = defaultClient.authentications['api-key'];
    apiKey.apiKey = process.env.BREVO_API_KEY;

    // 4️⃣ Construir el contenido HTsdML profesional
    const htmlContent = `
      <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; color: #333;">
        <div style="text-align: center; padding: 20px; background-color: #f8f9fa;">
          <img src="https://lbezcjvocrhgosfklbgs.supabase.co/storage/v1/object/public/mailimage//logoAgro_Mesa%20de%20trabajo%201.png" alt="Logo Agrojardin" style="max-width: 200px; height: auto;">
        </div>
        
        <div style="padding: 30px; background-color: #ffffff;">
          <h2 style="color: #2d995b; margin-bottom: 25px;">¡Gracias por tu compra, ${transaccion.nombre_completo}!</h2>
          
          <div style="margin-bottom: 25px;">
            <h3 style="color: #2d995b; border-bottom: 2px solid #eee; padding-bottom: 10px;">Detalles de la compra</h3>
            <p><strong>ID de Transacción:</strong> ${transaccion.id}</p>
            <p><strong>Total:</strong> $${transaccion.total} USD</p>
          </div>

          <div style="margin-bottom: 25px;">
            <h3 style="color: #2d995b; border-bottom: 2px solid #eee; padding-bottom: 10px;">Productos adquiridos</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background-color: #f8f9fa;">
                  <th style="text-align: left; padding: 10px;">Producto</th>
                  <th style="text-align: right; padding: 10px;">Precio</th>
                </tr>
              </thead>
              <tbody>
                ${productos.map(p => `
                  <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #eee;">${p.Producto}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${p.Precio} USD</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div style="margin-bottom: 25px;">
            <h3 style="color: #2d995b; border-bottom: 2px solid #eee; padding-bottom: 10px;">Información de envío</h3>
            <p>${transaccion.direccion}</p>
            <p>${transaccion.departamento}</p>
            <p>Código Postal: ${transaccion.codigo_postal}</p>
            <p>Contacto: ${transaccion.celular}</p>
          </div>

          <div style="text-align: center; padding: 20px; background-color: #f8f9fa; margin-top: 30px;">
            <p style="margin: 0;">¿Tienes dudas? Contáctanos a <a href="mailto:husqvarnapremiumstore@agrojardinmaldonado.com" style="color: #2d995b; text-decoration: none;">husqvarnapremiumstore@agrojardinmaldonado.com</a></p>
          </div>
        </div>
      </div>
    `;

    // 5️⃣ Configurar y enviar el email
    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    const sendSmtpEmail = {
      sender: {
        name: "Agrojardin",
        email: "noreply@agrojardinmaldonado.com"
      },
      to: [{ email: transaccion.email }],
      subject: `Confirmación de compra #${transaccion.id}`,
      htmlContent: htmlContent
    };

    const response = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log("Correo enviado:", response);

    return res.json({ message: 'Email enviado con éxito' });
    
  } catch (error) {
    console.error("Error al enviar email:", error);
    return res.status(500).json({ error: 'Error al enviar el email' });
  }
};





const ConsultaEstadoTransaccion = async (req, res) => {
  try {
    const { transaccionId } = req.body;

    if (!transaccionId) {
      return res.status(400).json({ error: "El ID de la transacción es requerido." });
    }

    const privateKey = loadPrivateKeyFromPfx();
    const fingerprint = "579F4609DD4315D890921F47293B0E7CAC6CB290";
    const expirationTime = moment().add(1, "hour").valueOf();

    // Objeto de referencia corregido (ahora con "Request")
    const referenceObject = {
      Client: "AgrojardinTest",
      Request: {
        MetaReference: transaccionId.toString(),
        Type: 0,
      },
    };

    // Payload a firmar con la estructura correcta
    const payloadToSign = {
      Object: {
        Fingerprint: fingerprint,
        Object: referenceObject, // Anidación correcta
        UTCUnixTimeExpiration: expirationTime,
      },
    };

    let jsonString = JSON.stringify(payloadToSign.Object, null, 0).replace(/\s+/g, "");

    // Firma del JSON
    const sign = createSign("SHA512");
    sign.update(jsonString);
    const signature = sign.sign(
      {
        key: privateKey,
        padding: require("crypto").constants.RSA_PKCS1_PADDING,
      },
      "base64"
    );

    // Construcción del JSON final con la firma
    const finalPayloadJson = JSON.stringify({
      Object: JSON.parse(jsonString), // Asegura que el objeto está bien estructurado
      Signature: signature,
    });

    console.log(finalPayloadJson);

    const response = await axios.post(
      "https://testing.plexo.com.uy:4043/SecurePaymentGateway.svc/Operation/Status",
      finalPayloadJson,
      { headers: { "Content-Type": "application/json" } }
    );

    console.log("✅ Respuesta de consulta de estado:", JSON.stringify(response.data, null, 2));

    return res.status(200).json(response.data);
  } catch (error) {
    console.error("❌ Error al consultar el estado de la transacción:", error.response?.data || error.message);
    return res.status(500).json({ error: "Error en la consulta del estado de la transacción." });
  }
};

const Callback = async (req, res) => {
  try {
    const event = req.body;
    console.log('Webhook recibido:', JSON.stringify(event, null, 2));

    const transactions = event?.Object?.Object?.Transactions;
    const clientReferenceId = transactions?.Purchase?.ClientReferenceId;
    const purchaseStatus = transactions?.Purchase?.Status;

    if (!transactions || !transactions.Purchase || !clientReferenceId) {
      console.error("Estructura del webhook incorrecta o falta ClientReferenceId");
      return res.status(400).json({ success: false, message: "Datos inválidos" });
    }

    const estado = purchaseStatus === 0 ? 0 : 1;

    // Buscar y actualizar la transacción en Supabase
    const { data, error } = await supabase
      .from('transacciones')
      .update({ estado })
      .eq('id', clientReferenceId);

    if (error) {
      console.error("Error actualizando la transacción:", error);
      return res.status(500).json({ success: false, message: "No se pudo actualizar el estado" });
    }

    return res.json({ success: true, updated: data });

  } catch (error) {
    console.error("Error procesando el webhook:", error);
    return res.status(500).json({ success: false, message: "Error interno del servidor" });
  }
};


const verifyPayment = async (req, res) => {
  const { transaccion_id } = req.query;

  if (!transaccion_id) {
    return res.status(400).json({ info: false, message: 'Falta transaccion_id' });
  }

  try {
    const { data, error } = await supabase
      .from('transacciones')
      .select('estado')
      .eq('id', transaccion_id)
      .single();

    if (error || !data) {
      return res.json({ info: false });
    }

    const estado = data.estado;

    if (estado === 0) {
      return res.json({ info: true, status: 0 }); // Éxito
    } else if (estado === 1) {
      return res.json({ info: true, status: 1 }); // Error
    } else {
      return res.json({ info: false }); // Aún en proceso (ej. estado 2)
    }

  } catch (err) {
    console.error('Error consultando el estado:', err);
    return res.status(500).json({ info: false, message: 'Error interno' });
  }
};






module.exports = {RecibeInfoExpressCheckout, updateTransaction, sendEmail, ConsultaEstadoTransaccion, Callback, verifyPayment};
