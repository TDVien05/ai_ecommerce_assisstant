import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import { formatVND } from '@/lib/format'

type Status = 'checking' | 'ok' | 'down'

export default function HomePage() {
  const [server, setServer] = useState<Status>('checking')
  const [db, setDb] = useState<string>('-')

  useEffect(() => {
    const controller = new AbortController()
    api
      .health(controller.signal)
      .then((res) => {
        setServer('ok')
        setDb(res.db)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setServer('down')
      })
    return () => controller.abort()
  }, [])

  return (
    <main className="mx-auto max-w-3xl p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Sales Assistant</h1>
        <p className="text-muted-foreground">Dashboard chủ shop</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trạng thái hệ thống</CardTitle>
          <CardDescription>GET /health</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <span>
            Server:{' '}
            <Badge variant={server === 'ok' ? 'default' : server === 'down' ? 'destructive' : 'secondary'}>
              {server}
            </Badge>
          </span>
          <span>
            Database: <Badge variant={db === 'ok' ? 'default' : 'secondary'}>{db}</Badge>
          </span>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">Ví dụ định dạng tiền: {formatVND(250000)}</p>
    </main>
  )
}
