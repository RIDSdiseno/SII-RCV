const axios  = require('axios')
const crypto = require('crypto')

const SII_RCV_BASE = {
  produccion:    'https://www4.sii.cl/consdcvinternetui/services/data/facadeService',
  certificacion: 'https://www4c.sii.cl/consdcvinternetui/services/data/facadeService',
}

const NOMBRES_MES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const TIPOS_DOC = {
  FACTURA_ELECTRONICA:        33,
  FACTURA_EXENTA_ELECTRONICA: 34,
  LIQUIDACION_FACTURA:        43,
  NOTA_DEBITO_ELECTRONICA:    56,
  NOTA_CREDITO_ELECTRONICA:   61,
  BOLETA_ELECTRONICA:         39,
  BOLETA_EXENTA_ELECTRONICA:  41,
}

// ─── Caché en memoria ────────────────────────────────────────────────────────
const cache     = new Map()
const CACHE_TTL = 30 * 60 * 1000 // 30 minutos en ms

function getCacheKey(rutEmpresa, periodo, tipo) {
  return `${rutEmpresa}_${periodo}_${tipo}`
}

function getCache(key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key)
    console.log(`🗑️  Caché expirado para ${key}`)
    return null
  }
  return entry.data
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() })
  console.log(`💾 Guardado en caché: ${key}`)
}

function clearCache(rutEmpresa = null) {
  if (rutEmpresa) {
    // Limpiar solo las entradas de esa empresa
    for (const key of cache.keys()) {
      if (key.startsWith(rutEmpresa)) cache.delete(key)
    }
    console.log(`🗑️  Caché limpiado para ${rutEmpresa}`)
  } else {
    cache.clear()
    console.log('🗑️  Caché completo limpiado')
  }
}

function getCacheStats() {
  const entries = []
  for (const [key, entry] of cache.entries()) {
    const edadMinutos = Math.floor((Date.now() - entry.timestamp) / 60000)
    const expiraEn    = Math.floor((CACHE_TTL - (Date.now() - entry.timestamp)) / 60000)
    entries.push({ key, edadMinutos, expiraEnMinutos: expiraEn })
  }
  return { total: cache.size, entries }
}
// ─────────────────────────────────────────────────────────────────────────────

function getBase(ambiente) {
  return ambiente === 1 ? SII_RCV_BASE.produccion : SII_RCV_BASE.certificacion
}

function separarRut(rut) {
  const partes = rut.split('-')
  return { rut: partes[0], dv: partes[1] }
}

async function iniciarSesionRCV(token, rutCertificado, rutEmpresa, ambiente) {
  const { rut: rutCert, dv: dvCert } = separarRut(rutCertificado)

  console.log('🔑 Paso 1: Seleccionando empresa...')
  try {
    await axios.get('https://www1.sii.cl/cgi-bin/Portal001/mipeSelEmpresa.cgi', {
      params: { RUT_EMP: rutEmpresa },
      headers: {
        'Cookie':  `TOKEN=${token}; RUT_NS=${rutCert}; DV_NS=${dvCert}; CSESSIONID=${token}`,
        'Accept':  'text/html,application/xhtml+xml,*/*',
        'Referer': 'https://www.sii.cl/',
      },
      maxRedirects: 5,
      timeout: 30000,
    })
    console.log('✅ Empresa seleccionada')
  } catch (error) {
    console.log('ℹ️ Selección empresa:', error.response?.status || error.message)
  }

  const loginUrl = ambiente === 1
    ? 'https://www4.sii.cl/consdcvinternetui/index.html'
    : 'https://www4c.sii.cl/consdcvinternetui/index.html'

  console.log('🔑 Paso 2: Accediendo portal RCV...')
  try {
    await axios.get(loginUrl, {
      headers: {
        'Cookie':  `TOKEN=${token}; RUT_NS=${rutCert}; DV_NS=${dvCert}; CSESSIONID=${token}`,
        'Accept':  'text/html,application/xhtml+xml,*/*',
        'Referer': 'https://www1.sii.cl/',
      },
      maxRedirects: 5,
      timeout: 30000,
    })
    console.log('✅ Portal RCV accedido')
  } catch (error) {
    console.log('ℹ️ Portal RCV:', error.response?.status || error.message)
  }
}

async function llamarAPI(token, rutCertificado, rutEmpresa, periodo, operacion, estadoContab, ambiente, endpoint, codTipoDoc = null) {
  const base                         = getBase(ambiente)
  const url                          = `${base}/${endpoint}`
  const { rut: rutCert, dv: dvCert } = separarRut(rutCertificado)
  const { rut: rutEmp,  dv: dvEmp  } = separarRut(rutEmpresa)

  const data = {
    rutEmisor:       rutEmp,
    dvEmisor:        dvEmp,
    ptributario:     periodo,
    operacion:       operacion,
    estadoContab:    estadoContab,
    busquedaInicial: true,
  }

  if (codTipoDoc !== null) {
    data.codTipoDoc = codTipoDoc
  }

  const body = {
    metaData: {
      conversationId: token,
      transactionId:  crypto.randomUUID(),
      namespace:      `cl.sii.sdi.lob.diii.consdcv.data.api.interfaces.FacadeService/${endpoint}`,
      page:           null,
    },
    data,
  }

  console.log('🌐 URL:', url)

  try {
    const response = await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'Accept':       'application/json, text/plain, */*',
        'Cookie':       `TOKEN=${token}; RUT_NS=${rutCert}; DV_NS=${dvCert}; CSESSIONID=${token}`,
        'Referer':      ambiente === 1
          ? 'https://www4.sii.cl/consdcvinternetui/'
          : 'https://www4c.sii.cl/consdcvinternetui/',
        'Origin': ambiente === 1
          ? 'https://www4.sii.cl'
          : 'https://www4c.sii.cl',
      },
      timeout: 120000,
    })

    console.log('✅ Status:', response.status)
    return response.data

  } catch (error) {
    if (error.response) {
      console.log('❌ Status:', error.response.status)
      console.log('❌ Body:', JSON.stringify(error.response.data).substring(0, 500))
    }
    throw new Error(`Error llamando SII [${endpoint}]: ${error.message}`)
  }
}

async function obtenerDetallesTodos(token, rutCertificado, rutEmpresa, periodo, operacion, ambiente, endpointDetalle) {
  const tiposDoc   = Object.values(TIPOS_DOC)
  const resultados = []

  for (const tipo of tiposDoc) {
    try {
      const data = await llamarAPI(
        token, rutCertificado, rutEmpresa, periodo,
        operacion, 'REGISTRO', ambiente, endpointDetalle, tipo
      )
      if (data?.data && data.data.length > 0) {
        resultados.push({ tipDoc: tipo, ...data })
      }
    } catch {
      // Ignorar tipos sin documentos
    }
  }

  return resultados
}

/**
 * Consulta RCV por MES completo — con caché
 */
async function consultarRCVMes(token, rutCertificado, rutEmpresa, mes, anio, ambiente = 0) {
  console.log(`📋 Consultando RCV mes ${mes}/${anio} para ${rutEmpresa}...`)

  const mesPad   = String(mes).padStart(2, '0')
  const periodo  = `${anio}${mesPad}`
  const cacheKey = getCacheKey(rutEmpresa, periodo, 'mes')

  // Revisar caché
  const cached = getCache(cacheKey)
  if (cached) {
    console.log(`📦 Retornando desde caché: ${cacheKey}`)
    return cached
  }

  await iniciarSesionRCV(token, rutCertificado, rutEmpresa, ambiente)

  const resumenCompras = await llamarAPI(token, rutCertificado, rutEmpresa, periodo, 'COMPRA', 'REGISTRO', ambiente, 'getResumen')
  const resumenVentas  = await llamarAPI(token, rutCertificado, rutEmpresa, periodo, 'VENTA',  'REGISTRO', ambiente, 'getResumen')
  const detalleCompras = await obtenerDetallesTodos(token, rutCertificado, rutEmpresa, periodo, 'COMPRA', ambiente, 'getDetalleCompra')
  const detalleVentas  = await obtenerDetallesTodos(token, rutCertificado, rutEmpresa, periodo, 'VENTA',  ambiente, 'getDetalleVenta')

  const resultado = {
    caratula:  { mes, anio, nombreMes: NOMBRES_MES[mes], periodo },
    compras:   { resumenes: resumenCompras, detalle: detalleCompras },
    ventas:    { resumenes: resumenVentas,  detalle: detalleVentas },
    fromCache: false,
  }

  setCache(cacheKey, resultado)
  return resultado
}

/**
 * Consulta RCV por DÍA — con caché
 */
async function consultarRCVDia(token, rutCertificado, rutEmpresa, dia, mes, anio, ambiente = 0) {
  console.log(`📋 Consultando RCV día ${dia}/${mes}/${anio} para ${rutEmpresa}...`)

  const mesPad   = String(mes).padStart(2, '0')
  const periodo  = `${anio}${mesPad}`
  const diaPad   = String(dia).padStart(2, '0')
  const cacheKey = getCacheKey(rutEmpresa, `${periodo}_${diaPad}`, 'dia')

  const cached = getCache(cacheKey)
  if (cached) {
    console.log(`📦 Retornando desde caché: ${cacheKey}`)
    return cached
  }

  await iniciarSesionRCV(token, rutCertificado, rutEmpresa, ambiente)

  const resumenCompras = await llamarAPI(token, rutCertificado, rutEmpresa, periodo, 'COMPRA', 'REGISTRO', ambiente, 'getResumen')
  const resumenVentas  = await llamarAPI(token, rutCertificado, rutEmpresa, periodo, 'VENTA',  'REGISTRO', ambiente, 'getResumen')
  const detalleCompras = await obtenerDetallesTodos(token, rutCertificado, rutEmpresa, periodo, 'COMPRA', ambiente, 'getDetalleCompra')
  const detalleVentas  = await obtenerDetallesTodos(token, rutCertificado, rutEmpresa, periodo, 'VENTA',  ambiente, 'getDetalleVenta')

  const resultado = {
    caratula:  { mes, anio, dia, nombreMes: NOMBRES_MES[mes], periodo },
    compras:   { resumenes: resumenCompras, detalle: detalleCompras },
    ventas:    { resumenes: resumenVentas,  detalle: detalleVentas },
    fromCache: false,
  }

  setCache(cacheKey, resultado)
  return resultado
}

module.exports = { consultarRCVMes, consultarRCVDia, clearCache, getCacheStats, TIPOS_DOC }