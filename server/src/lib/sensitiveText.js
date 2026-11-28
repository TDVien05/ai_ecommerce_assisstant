const moneyUnit = /^\s*(?:₫|đ(?:ồng)?|d(?:ong)?|k|nghìn|nghin|ngàn|ngan|triệu|trieu)(?![\p{L}\p{N}])/iu
const numberSequence = /(?<!\d)\d{6,32}(?!\d)/g
const context = /(?:tai\s*khoan|ngan\s*hang|\bstk\b|\bso\s*tk\b|bank\s*account)/u
const normalized = (value) => value.toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d')

function isAmount(text,index,value) {
  const before=text.slice(Math.max(0,index-2),index), after=text.slice(index+value.length)
  return /\d[.,]$/.test(before) || /^[.,]\d/.test(after) || moneyUnit.test(after)
}

export function redactOwnerText(text) {
  if (!context.test(normalized(text))) return text
  return text.replace(numberSequence,(value,index)=>isAmount(text,index,value) ? value : `${'*'.repeat(value.length-4)}${value.slice(-4)}`)
}

export function hasSensitiveDraftNumber(text) {
  for (const match of text.matchAll(/(?<!\d)\d{9,}(?!\d)/g)) if (!isAmount(text,match.index,match[0])) return true
  return false
}

// Statement references are identifiers: only mask one when the account label
// precedes it. In descriptions, standalone long digit sequences are also hidden.
export function redactStatementText(text,{reference=false}={}) {
  if(text===null || text===undefined)return text
  const labeled=/(?<![\p{L}\p{N}_])(?:số\s*tk|so\s*tk|tài\s*khoản|tai\s*khoan|account|stk|tk|acc)(?![\p{L}\p{N}_])\s*[:#-]?\s*(\d{6,32})(?![\p{L}\p{N}_-])/giu
  const marked=text.replace(labeled,(whole,value,offset)=>{
    const index=offset+whole.length-value.length
    return isAmount(text,index,value)?whole:whole.slice(0,-value.length)+`${'*'.repeat(value.length-4)}${value.slice(-4)}`
  })
  if(reference)return marked
  return marked.replace(/(?<![\p{L}\p{N}_-])\d{9,19}(?![\p{L}\p{N}_-])/gu,(value,index)=>isAmount(marked,index,value)?value:`${'*'.repeat(value.length-4)}${value.slice(-4)}`)
}
