const forge = require('node-forge');
const fs = require('fs');

const loadPrivateKeyFromPfx = () => {
  try {
    const pfxPath = './certs/AgrojardinTest.pfx';
    const pfxPassword = 'XpJj8EuMGg2ZVBWa5d'; // <-- Asegúrate aquí

    const pfxData = fs.readFileSync(pfxPath, 'binary');
    const p12Der = forge.asn1.fromDer(pfxData);
    
    // Convertir a PKCS12 usando la contraseña
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Der, false, pfxPassword);

    // Obtener todos los "bags" posibles
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const privateKeyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];

    if (!privateKeyBag || privateKeyBag.length === 0) {
      throw new Error('No se encontró la clave privada en el PFX');
    }

    // Extraer la clave privada
    const privateKey = forge.pki.privateKeyToPem(privateKeyBag[0].key);
    return privateKey;

  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
};

module.exports = { loadPrivateKeyFromPfx };