import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

function App() {
  const [greeted, setGreeted] = useState(false)

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <Badge variant="secondary">shadcn/ui</Badge>
          <CardTitle>
            <h1 className="text-2xl">Hello world</h1>
          </CardTitle>
          <CardDescription>A simple start with React and shadcn/ui.</CardDescription>
        </CardHeader>
        <CardContent>
          <p role="status" className="text-sm">
            {greeted ? 'Hello! Nice to meet you.' : 'Your UI components are ready.'}
          </p>
        </CardContent>
        <CardFooter>
          <Button type="button" onClick={() => setGreeted(!greeted)}>
            {greeted ? 'Reset greeting' : 'Say hello'}
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}

export default App
