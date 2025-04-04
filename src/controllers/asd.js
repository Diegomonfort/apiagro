const RecibeInfoExpressCheckout = async (req, res) => {
    try {
      const { datosPersonales, direccionEnvio, products } = req.body;
  
      // Validación mejorada de datos
      if (!datosPersonales || !direccionEnvio || !products || !Array.isArray(products)) {
        return res.status(400).json({ error: "Faltan datos requeridos o la estructura de datos es incorrecta." });
      }
  
      // Validar estructura de productos
      if (!products.every(p => p.id && typeof p.quantity === 'number')) {
        return res.status(400).json({ error: "Estructura de productos inválida. Cada producto debe tener id y quantity." });
      }
  
      // Crear mapa de cantidades para rápido acceso
      const quantityMap = products.reduce((acc, curr) => {
        acc[curr.id] = curr.quantity;
        return acc;
      }, {});
  
      // Extraer IDs para la consulta
      const productIds = products.map(p => p.id);
  
      // Consultar productos en Supabase
      const { data: productos, error } = await supabase
        .from("productos")
        .select("id, Precio, Descripción, Producto")
        .in("id", productIds);
  
      if (error) {
        console.error("❌ Error al consultar productos en Supabase:", error);
        return res.status(500).json({ error: "Error al obtener información de los productos." });
      }
  
      // Verificar coincidencia de productos
      if (productos.length !== productIds.length) {
        const missingProducts = productIds.filter(id => !productos.some(p => p.id === id));
        return res.status(400).json({ 
          error: "Algunos productos no existen en la base de datos.",
          missingProducts
        });
      }
  
      // Calcular total con cantidades
      const totalCompra = productos.reduce((acc, producto) => {
        return acc + (producto.Precio * quantityMap[producto.id]);
      }, 0);
  
      // Construir items para la pasarela de pagos
      const itemsArray = productos.map((producto) => ({
        Amount: parseFloat((producto.Precio * quantityMap[producto.id]).toFixed(2)),
        ClientItemReferenceId: `Item-${producto.id}`,
        Name: `${producto.Producto}`,
        Quantity: quantityMap[producto.id],
      }));
  
      // Guardar transacción en base de datos
      const { data: nuevaTransaccion, error: errorTransaccion } = await supabase
        .from("transacciones")
        .insert([
          {
            departamento: direccionEnvio.ciudad,
            codigo_postal: direccionEnvio.codigoPostal,
            email: datosPersonales.email,
            celular: datosPersonales.telefono,
            nombre_completo: `${direccionEnvio.nombre} ${direccionEnvio.apellido}`,
            productos: products.map(p => ({ id: p.id, cantidad: p.quantity })), // Guardar con cantidades
            total: totalCompra,
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
      const fingerprint = "579F4609DD4315D890921F47293B0E7CAC6CB290";
      const expirationTime = moment().add(1, "hour").valueOf();
  
      // Construir objeto para la pasarela
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
            ClientReferenceId: nuevaTransaccion.id.toString(),
            CurrencyId: 2,
            FinancialInclusion: {
              BilledAmount: parseFloat(itemsArray.reduce((acc, item) => acc + item.Amount, 0).toFixed(2)),
              InvoiceNumber: -1390098693,
              TaxedAmount: parseFloat((itemsArray.reduce((acc, item) => acc + item.Amount, 0) * 0.9).toFixed(2)),
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
  
      // Generar firma digital
      const payloadToSign = {
        Fingerprint: fingerprint,
        Object: canonicalize(innerObject),
        UTCUnixTimeExpiration: expirationTime,
      };
  
      let jsonString = JSON.stringify(payloadToSign, null, 0).replace(/\s+/g, "");
  
      // Ajustar formato numérico para la firma
      jsonString = jsonString
        .replace(/"BilledAmount":(\d+)(,|})/g, '"BilledAmount":$1.0$2')
        .replace(/"TaxedAmount":(\d+)(,|})/g, '"TaxedAmount":$1.0$2')
        .replace(/"Amount":(\d+)(,|})/g, '"Amount":$1.0$2');
  
      const sign = crypto.createSign("SHA512");
      sign.update(jsonString);
      const signature = sign.sign(
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_PADDING,
        },
        "base64"
      );
  
      const finalPayloadJson = `{"Object":${jsonString},"Signature":"${signature}"}`;
  
      // Enviar a pasarela de pagos
      const response = await axios.post(
        "https://testing.plexo.com.uy:4043/SecurePaymentGateway.svc/ExpressCheckout",
        finalPayloadJson,
        { headers: { "Content-Type": "application/json" } }
      );
  
      console.log("✅ Respuesta de pasarela:", JSON.stringify(response.data, null, 2));
  
      return res.status(200).json({
        ...response.data,
        transaccionId: nuevaTransaccion.id,
      });
  
    } catch (error) {
      console.error("❌ Error en el proceso de pago:", error.response?.data || error.message);
      return res.status(500).json({ 
        error: "Error en el procesamiento del pago.",
        details: error.message
      });
    }
  };
  