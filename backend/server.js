import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import fetch from 'node-fetch'

const app = express()
const server = createServer(app)
const io = new Server(server, { cors: { origin: '*' } })

const BASE_URL = process.env.BASE_URL || 'https://tesa-api.crma.dev/api'
const PORT = parseInt(process.env.PORT || '8080', 10)
const POLL_MS = parseInt(process.env.POLL_MS || '5000', 10)

const CAMS = [
  { name: 'offensive', id: process.env.OFF_CAM_ID, token: process.env.OFF_TOKEN },
  { name: 'defensive', id: process.env.DEF_CAM_ID, token: process.env.DEF_TOKEN },
]

// 🧠 เก็บ cache ข้อมูลล่าสุดของแต่ละทีม
let lastByTeam = { offensive: [], defensive: [] }

// 🛰️ ดึงข้อมูลจาก API TESA
async function fetchDetections(camId, token) {
  const url = `${BASE_URL}/object-detection/${camId}`
  const res = await fetch(url, { headers: { 'x-camera-token': token } })
  if (!res.ok) throw new Error(`fetch detections failed ${res.status}`)
  const json = await res.json()

  let array = Array.isArray(json.data) ? json.data : []

  console.log(array.length)  // ✅ ไม่มีวงเล็บ
  return array
}

// ✅ Proxy image (inject token server-side)
app.get('/files/:camId/:filename', async (req, res) => {
  const { camId, filename } = req.params
  const cam = CAMS.find((c) => c.id === camId)
  if (!cam) return res.status(404).json({ message: 'Unknown camera' })
  const url = `${BASE_URL}/files/${camId}/${filename}`

  try {
    const upstream = await fetch(url, { headers: { 'x-camera-token': cam.token } })
    if (!upstream.ok) {
      const text = await upstream.text()
      return res.status(upstream.status).send(text)
    }
    res.set('content-type', upstream.headers.get('content-type') || 'image/jpeg')
    upstream.body.pipe(res)
  } catch (e) {
    res.status(500).json({ message: 'proxy_error', detail: e.message })
  }
})

// ✅ เมื่อ client เชื่อมต่อ socket
io.on('connection', (socket) => {
  console.log('🟢 client connected', socket.id)

  // ส่ง cache ล่าสุดให้ client ทันที
  for (const team of ['offensive', 'defensive']) {
    if (lastByTeam[team]?.length > 0) {
      socket.emit(`${team}_update`, lastByTeam[team])
    }
  }

  socket.on('disconnect', () => {
    console.log('🔴 client disconnected', socket.id)
  })
})

/**
 * ✅ ฟังก์ชันตรวจจับความเปลี่ยนแปลง:
 * - ถ้ามีข้อมูลใหม่ → emit update
 * - ถ้าข้อมูลถูกลบทั้งหมด → emit clear
 */
async function tick() {
  for (const cam of CAMS) {
    try {
      const list = await fetchDetections(cam.id, cam.token)

      // ✅ กรณีข้อมูลหาย (โดนลบจาก TESA)
      if (list.length === 0) {
        if (lastByTeam[cam.name].length > 0) {
          console.log(`🧹 ${cam.name.toUpperCase()} cleared (no data from API)`)
          io.emit(`${cam.name}_clear`)
          lastByTeam[cam.name] = []
        }
        continue
      }

      // ✅ ถ้ามีข้อมูล → แปลง path ให้ใช้ proxy
      const fixed = list.map((item) => {
        if (item.image_path) {
          const parts = item.image_path.split('/')
          const filename = parts[parts.length - 1]
          return { ...item, image_path: `/files/${cam.id}/${filename}` }
        }
        return item
      })

      // ✅ ตรวจว่าข้อมูลเปลี่ยนจากรอบก่อนหรือไม่
      const prev = lastByTeam[cam.name]
      const prevId = prev?.[0]?.id
      const newId = fixed?.[0]?.id

      if (newId !== prevId) {
        lastByTeam[cam.name] = fixed
        io.emit(`${cam.name}_update`, fixed)
        console.log(`📡 push ${cam.name} (frames=${fixed.length}) id=${newId}`)
      }
    } catch (e) {
      console.error(`❌ ${cam.name} fetch failed:`, e.message)
    }
  }
}

// ✅ Loop ดึงข้อมูลเรื่อย ๆ
setInterval(tick, POLL_MS)
tick()

server.listen(PORT, () => {
  console.log(`✅ Backend ready on http://localhost:${PORT}`)
})
