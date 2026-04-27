const express = require('express')
const router  = express.Router()
const { upload } = require('../middlewares/upload')
const { autenticar } = require('../sii/auth')
const { consultarRCVMes, consultarRCVDia, clearCache, getCacheStats } = require('../sii/rcv')

function parsearInput(req) {
  try {
    return typeof req.body.input === 'string'
      ? JSON.parse(req.body.input)
      : req.body.input
  } catch {
    throw new Error('El campo "input" no es un JSON válido')
  }
}

function validarInput({ RutCertificado, RutEmpresa, Password, Ambiente }) {
  if (!RutCertificado) throw new Error('Falta RutCertificado')
  if (!RutEmpresa)     throw new Error('Falta RutEmpresa')
  if (!Password)       throw new Error('Falta Password')
  if (Ambiente === undefined || Ambiente === null) throw new Error('Falta Ambiente')
}

// POST /api/rcv/compras/:mes/:anio
router.post('/compras/:mes/:anio', upload.single('files'), async (req, res) => {
  try {
    const input = parsearInput(req)
    validarInput(input)
    const { RutCertificado, RutEmpresa, Password, Ambiente } = input

    const mes  = parseInt(req.params.mes)
    const anio = parseInt(req.params.anio)

    if (isNaN(mes)  || mes  < 1 || mes  > 12)     return res.status(400).json({ error: 'Mes inválido' })
    if (isNaN(anio) || anio < 2000 || anio > 2100) return res.status(400).json({ error: 'Año inválido' })
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo .pfx' })

    const token     = await autenticar(req.file.buffer, Password, Ambiente)
    const resultado = await consultarRCVMes(token, RutCertificado, RutEmpresa, mes, anio, Ambiente)

    res.json(resultado)

  } catch (error) {
    console.error('❌ Error en /compras/:mes/:anio →', error.message)
    res.status(500).json({ error: error.message })
  }
})

// POST /api/rcv/compras/:dia/:mes/:anio
router.post('/compras/:dia/:mes/:anio', upload.single('files'), async (req, res) => {
  try {
    const input = parsearInput(req)
    validarInput(input)
    const { RutCertificado, RutEmpresa, Password, Ambiente } = input

    const dia  = parseInt(req.params.dia)
    const mes  = parseInt(req.params.mes)
    const anio = parseInt(req.params.anio)

    if (isNaN(dia)  || dia  < 1  || dia  > 31)    return res.status(400).json({ error: 'Día inválido' })
    if (isNaN(mes)  || mes  < 1  || mes  > 12)    return res.status(400).json({ error: 'Mes inválido' })
    if (isNaN(anio) || anio < 2000 || anio > 2100) return res.status(400).json({ error: 'Año inválido' })
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo .pfx' })

    const token     = await autenticar(req.file.buffer, Password, Ambiente)
    const resultado = await consultarRCVDia(token, RutCertificado, RutEmpresa, dia, mes, anio, Ambiente)

    res.json(resultado)

  } catch (error) {
    console.error('❌ Error en /compras/:dia/:mes/:anio →', error.message)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/rcv/cache
router.get('/cache', (req, res) => {
  res.json(getCacheStats())
})

// DELETE /api/rcv/cache
router.delete('/cache', (req, res) => {
  clearCache()
  res.json({ message: 'Caché limpiado' })
})

// DELETE /api/rcv/cache/:rutEmpresa
router.delete('/cache/:rutEmpresa', (req, res) => {
  clearCache(req.params.rutEmpresa)
  res.json({ message: `Caché limpiado para ${req.params.rutEmpresa}` })
})

module.exports = router