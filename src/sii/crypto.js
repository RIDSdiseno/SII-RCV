const forge = require('node-forge')

function loadPfx(pfxBuffer, password) {
  const p12Der = forge.util.createBuffer(pfxBuffer.toString('binary'))
  const p12Asn1 = forge.asn1.fromDer(p12Der)
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password)

  let privateKey = null
  let certificate = null

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]
  if (keyBag) privateKey = keyBag.key

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })
  const certBag = certBags[forge.pki.oids.certBag]?.[0]
  if (certBag) certificate = certBag.cert

  if (!privateKey || !certificate) {
    throw new Error('No se pudo extraer la clave privada o el certificado del .pfx')
  }

  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).bytes()
  const certB64 = forge.util.encode64(certDer)

  const publicKey = certificate.publicKey
  const modulus = forge.util.encode64(
    forge.util.hexToBytes(publicKey.n.toString(16))
  )
  const exponent = forge.util.encode64(
    forge.util.hexToBytes(publicKey.e.toString(16))
  )

  return { privateKey, certificate, certB64, modulus, exponent }
}

function firmarSemilla(semilla, pfxBuffer, password) {
  const { privateKey, certB64, modulus, exponent } = loadPfx(pfxBuffer, password)

  const xmlToSign = `<getToken><item><Semilla>${semilla}</Semilla></item></getToken>`

  const md = forge.md.sha1.create()
  md.update(forge.util.encodeUtf8(xmlToSign))
  const digestValue = forge.util.encode64(md.digest().bytes())

  // SignedInfo en una sola línea sin espacios
  const signedInfo = '<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">'
    + '<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>'
    + '<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>'
    + '<Reference URI="">'
    + '<Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></Transforms>'
    + '<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>'
    + '<DigestValue>' + digestValue + '</DigestValue>'
    + '</Reference>'
    + '</SignedInfo>'

  const mdSign = forge.md.sha1.create()
  mdSign.update(forge.util.encodeUtf8(signedInfo))
  const signatureValue = forge.util.encode64(privateKey.sign(mdSign))

  // XML firmado en una sola línea, sin saltos ni espacios
  const xmlFirmado = '<?xml version="1.0"?>'
    + '<getToken>'
    + '<Semilla>' + semilla + '</Semilla>'
    + signedInfo
    + '<SignatureValue>' + signatureValue + '</SignatureValue>'
    + '<Modulus>' + modulus + '</Modulus>'
    + '<Exponent>' + exponent + '</Exponent>'
    + '<X509Certificate>' + certB64 + '</X509Certificate>'
    + '</getToken>'

  console.log('¿Tiene saltos de línea?', xmlFirmado.includes('\n'))
  console.log('LARGO XML:', xmlFirmado.length)
  console.log('INICIO:', xmlFirmado.substring(0, 150))
  console.log('FIN:', xmlFirmado.slice(-150))

  const xmlEscapado = xmlFirmado
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  // SOAP también en una sola línea
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + '<soapenv:Body>'
    + '<getToken>'
    + '<pszXml xsi:type="xsd:string">' + xmlEscapado + '</pszXml>'
    + '</getToken>'
    + '</soapenv:Body>'
    + '</soapenv:Envelope>'
}

module.exports = { loadPfx, firmarSemilla }