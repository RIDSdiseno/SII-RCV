require('dotenv').config()
const express = require('express')
const rcvRoutes = require('./routes/rcv.routes')

const app  = express()
const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ── CORS — para que tu front pueda llamar este servicio ──
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

app.use('/api/rcv', rcvRoutes)

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use((req, res) => {
  res.status(404).json({ error: `Ruta ${req.method} ${req.path} no encontrada` })
})

app.use((err, req, res, next) => {
  console.error('💥 Error:', err.message)
  res.status(500).json({ error: err.message })
})

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`)
  console.log(`📋 Ambiente SII: ${process.env.SII_AMBIENTE === '1' ? 'PRODUCCIÓN' : 'CERTIFICACIÓN'}`)
})

module.exports = app