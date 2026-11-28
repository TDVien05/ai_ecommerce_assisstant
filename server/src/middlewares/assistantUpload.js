import multer from 'multer'
import { appError } from '../errors/index.js'
const receive = multer({ storage:multer.memoryStorage(), limits:{fileSize:2097152,files:1,fields:0} }).single('file')
export function assistantUpload(req,res,next) {
  receive(req,res,(err) => {
    if (!err) return next()
    // INVALID_FILE is 400, or 413 when the file is over the size limit.
    if (err.code === 'LIMIT_FILE_SIZE') return next(appError('INVALID_FILE', 'Tệp sao kê vượt quá 2 MB.', { status: 413 }))
    next(appError('INVALID_FILE', 'Chỉ nhận một tệp CSV hoặc XLSX.'))
  })
}
