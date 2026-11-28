import multer from 'multer'
import { HttpError } from '../lib/httpError.js'
const receive = multer({ storage:multer.memoryStorage(), limits:{fileSize:2097152,files:1,fields:0} }).single('file')
export function assistantUpload(req,res,next) {
  receive(req,res,(err) => {
    if (err) return next(new HttpError(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400,'INVALID_FILE',err.code === 'LIMIT_FILE_SIZE' ? 'Tệp CSV vượt quá 2 MB.' : 'Chỉ nhận một tệp CSV.'))
    next()
  })
}
