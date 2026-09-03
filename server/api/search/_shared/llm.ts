import type { SearchMessageStatus } from '~/types/search'
import type { RetrievedEvidenceItem } from './retrieval'
import { buildStructuredFallbackAnswer } from './fallback-answer'

export interface GeneratedAnswer {
  content: string
  messageStatus: SearchMessageStatus
}

export async function generateSearchAnswer(prompt: string): Promise<GeneratedAnswer> {
  const apiKey = process.env.OPENAI_API_KEY
  const apiBase = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'
  const model = process.env.MODEL_NAME || 'gpt-4o-mini'

  if (!apiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Missing OPENAI_API_KEY for search generation',
    })
  }

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  })

  if (!response.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Search model request failed',
    })
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string
      }
    }>
  }

  return {
    content: data.choices?.[0]?.message?.content?.trim() || '暂时没有生成可用回复。',
    messageStatus: 'completed',
  }
}

export async function generateSearchAnswerStream(
  prompt: string,
  onDelta: (delta: string) => void,
  signal?: AbortSignal
): Promise<GeneratedAnswer> {
  const apiKey = process.env.OPENAI_API_KEY
  const apiBase = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'
  const model = process.env.MODEL_NAME || 'gpt-4o-mini'

  if (!apiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Missing OPENAI_API_KEY for search generation',
    })
  }

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    signal,
    body: JSON.stringify({
      model,
      temperature: 0.3,
      stream: true,
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  })

  if (!response.ok || !response.body) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Search model streaming request failed',
    })
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let sawDone = false

  const processLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return

    const payload = trimmed.slice(5).trim()
    if (!payload) return
    if (payload === '[DONE]') {
      sawDone = true
      return
    }

    const data = JSON.parse(payload) as {
      error?: { message?: string }
      choices?: Array<{
        delta?: {
          content?: string
        }
        finish_reason?: string | null
      }>
    }
    if (data.error) {
      throw new Error(data.error.message || 'Search model stream returned an error')
    }
    if (data.choices?.[0]?.finish_reason === 'length') {
      throw new Error('Search model stream reached its output limit')
    }
    const delta = data.choices?.[0]?.delta?.content
    if (!delta) return

    content += delta
    onDelta(delta)
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''
    lines.forEach(processLine)
  }

  buffer += decoder.decode()
  if (buffer.trim()) processLine(buffer)

  if (!sawDone) {
    throw new Error('Search model stream ended unexpectedly')
  }
  if (!content.trim()) {
    throw new Error('Search model stream returned no content')
  }

  return {
    content: content.trim(),
    messageStatus: 'completed',
  }
}

export function buildFallbackSearchAnswer(input: {
  query: string
  evidence: RetrievedEvidenceItem[]
}): GeneratedAnswer {
  return {
    content: buildStructuredFallbackAnswer(input),
    messageStatus: 'failed',
  }
}
