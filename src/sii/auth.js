const axios = require('axios')
const xml2js = require('xml2js')
const { firmarSemilla } = require('./crypto')

const SII_URLS = {
  produccion: {
    semilla: 'https://palena.sii.cl/DTEWS/CrSeed.jws',
    token:   'https://palena.sii.cl/DTEWS/GetTokenFromSeed.jws',
  },
  certificacion: {
    semilla: 'https://maullin.sii.cl/DTEWS/CrSeed.jws',
    token:   'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws',
  },
}

const parser = new xml2js.Parser({ explicitArray: false, tagNameProcessors: [xml2js.processors.stripPrefix] })

async function parseXml(xml) {
  return parser.parseStringPromise(xml)
}

function getUrls(ambiente) {
  return ambiente === 1 ? SII_URLS.produccion : SII_URLS.certificacion
}

async function obtenerSemilla(ambiente = 0) {
  const { semilla: url } = getUrls(ambiente)

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soapenv:Body>
    <getSeed/>
  </soapenv:Body>
</soapenv:Envelope>`

  const response = await axios.post(url, soapBody, {
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction':   '',
    },
    timeout: 30000,
  })

  const result = await parseXml(response.data)

  // El SII devuelve el XML interno como string escapado dentro de getSeedReturn._
  const xmlInterno =
    result?.Envelope?.Body?.getSeedResponse?.getSeedReturn?._ ||
    result?.Envelope?.Body?.getSeedResponse?.getSeedReturn

  if (!xmlInterno) {
    throw new Error('No se encontró getSeedReturn en la respuesta')
  }

  // Parsear el XML interno (segunda capa)
  const inner = await parseXml(xmlInterno)

  console.log('XML INTERNO PARSEADO:\n', JSON.stringify(inner, null, 2))

  // Navegar con stripPrefix aplicado: SII:RESP_BODY → RESP_BODY
  const semilla =
    inner?.RESPUESTA?.RESP_BODY?.SEMILLA

  if (!semilla) {
    throw new Error('No se pudo extraer la semilla del XML interno')
  }

  return semilla
}

async function obtenerToken(semilla, pfxBuffer, password, ambiente = 0) {
  const { token: url } = getUrls(ambiente)

  const xmlFirmado = firmarSemilla(semilla, pfxBuffer, password)
  console.log('XML FIRMADO ENVIADO:\n', xmlFirmado)

  let responseData = null

  try {
    const response = await axios.post(url, xmlFirmado, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction':   '',
      },
      timeout: 30000,
    })
    responseData = response.data
  } catch (err) {
    // Capturar la respuesta aunque venga con status 500
    if (err.response) {
      console.log('SII respondió con error HTTP:', err.response.status)
      console.log('BODY DEL ERROR:\n', err.response.data)
      responseData = err.response.data
    } else {
      throw err
    }
  }

  console.log('XML TOKEN CRUDO:\n', responseData)

  const result = await parseXml(responseData)
  console.log('TOKEN PARSEADO:\n', JSON.stringify(result, null, 2))

  const getTokenReturn =
    result?.Envelope?.Body?.getTokenResponse?.getTokenReturn

  const returnValue = getTokenReturn?._ || getTokenReturn

  let estado = null
  let token  = null

  if (typeof returnValue === 'string') {
    const inner = await parseXml(returnValue)
    console.log('TOKEN INTERNO:\n', JSON.stringify(inner, null, 2))
    estado = inner?.RESPUESTA?.RESP_HDR?.ESTADO
    token  = inner?.RESPUESTA?.RESP_BODY?.TOKEN
  } else {
    estado = returnValue?.RESP_HDR?.ESTADO
    token  = returnValue?.RESP_BODY?.TOKEN
  }

  if (estado !== '00') {
    const glosa = returnValue?.RESP_HDR?.GLOSA || 'Sin detalle'
    throw new Error(`SII rechazó autenticación. Estado: ${estado} | Glosa: ${glosa}`)
  }

  return token
}

async function autenticar(pfxBuffer, password, ambiente = 0) {
  console.log('🔐 Iniciando autenticación con SII...')
  const semilla = await obtenerSemilla(ambiente)
  const token   = await obtenerToken(semilla, pfxBuffer, password, ambiente)
  console.log('✅ Token obtenido correctamente')
  return token
}

module.exports = { autenticar, obtenerSemilla, obtenerToken }