const multer = require('multer')

// Memoria en vez de disco — más seguro para certificados
const storage = multer.memoryStorage()

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máximo
  fileFilter: (req, file, cb) => {
    const esPfx = file.originalname.endsWith('.pfx') ||
                  file.originalname.endsWith('.p12')
    if (esPfx) {
      cb(null, true)
    } else {
      cb(new Error('Solo se aceptan archivos .pfx o .p12'), false)
    }
  },
})

module.exports = { upload }