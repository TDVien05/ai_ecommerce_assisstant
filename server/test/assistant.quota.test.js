import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
process.env.AI_DAILY_RUN_LIMIT='2'
process.env.DATABASE_URL=process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
process.env.AI_MOCK='true'

test('quota isolates shops, refunds rejected requests and resets by Vietnam day', async () => {
  const {createRunLimiter}=await import('../src/services/assistant/quota.js')
  let now=new Date('2026-11-28T16:59:59Z')
  const reserve=createRunLimiter(2,()=>now)
  const first=reserve('a'); first.commit(); const rejected=reserve('a'); rejected.refund(); const second=reserve('a');second.commit()
  assert.throws(()=>reserve('a'),{status:429,code:'AI_DAILY_LIMIT'})
  const other=reserve('b'); other.commit()
  now=new Date('2026-11-28T17:00:00Z')
  const nextDay=reserve('a');nextDay.commit()
  assert.doesNotThrow(()=>reserve('a').commit())
  assert.throws(()=>reserve('a'),{status:429,code:'AI_DAILY_LIMIT'})
})

test('assistant messages enforce the same per-shop quota', {skip:!process.env.TEST_DATABASE_URL,timeout:15000}, async () => {
  process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;process.env.AI_MOCK='true'
  const {pool}=await import('../src/db/pool.js');const {env}=await import('../src/config/env.js');const {createApp}=await import('../src/app.js');const {typingFor}=await import('../src/services/assistant/events.js')
  const shop=randomUUID(),other=randomUUID(),user=randomUUID(),otherUser=randomUUID()
  const server=createApp().listen(0,'127.0.0.1');await new Promise((resolve)=>server.once('listening',resolve))
  const send=(id,uid)=>fetch(`http://127.0.0.1:${server.address().port}/api/assistant/messages`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${jwt.sign({shopId:id},env.JWT_SECRET,{subject:uid})}`},body:JSON.stringify({conversationId:'hub',text:'Xin chào',attachments:[]})})
  const wait=async(id)=>{for(let i=0;i<100 && typingFor(id).length;i++)await new Promise((resolve)=>setTimeout(resolve,20))}
  try {
    await pool.query('INSERT INTO shops (id,name) VALUES ($1,$2),($3,$4)',[shop,'A',other,'B'])
    await pool.query('INSERT INTO users (id,shop_id,email,password_hash) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)',[user,shop,`${user}@example.invalid`,'x',otherUser,other,`${otherUser}@example.invalid`,'x'])
    assert.equal((await send(shop,user)).status,204);await wait(shop)
    assert.equal((await send(shop,user)).status,204);await wait(shop)
    const limited=await send(shop,user);assert.equal(limited.status,429);assert.equal((await limited.json()).error.code,'AI_DAILY_LIMIT')
    assert.equal((await send(other,otherUser)).status,204);await wait(other)
  } finally {await new Promise((resolve)=>server.close(resolve));await pool.end()}
})
