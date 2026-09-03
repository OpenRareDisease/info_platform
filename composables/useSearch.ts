import { ref } from 'vue'
import type { SearchResponse, SearchSource, SearchTraceEntry } from '~/types/search'

export type SearchStatus = 'idle' | 'loading' | 'done' | 'error'

type StreamEvent =
  | { type: 'trace'; trace: SearchTraceEntry[] }
  | { type: 'sources_ready'; sources: SearchSource[] }
  | { type: 'answer_delta'; delta: string }
  | { type: 'result'; result: SearchResponse }
  | { type: 'error'; message: string }

export function useSearch() {
  const query = ref('')
  const status = ref<SearchStatus>('idle')
  const trace = ref<SearchTraceEntry[]>([])
  const sources = ref<SearchSource[]>([])
  const result = ref<SearchResponse | null>(null)
  const streamedAnswer = ref('')
  const errorMessage = ref('')
  let requestSequence = 0
  let activeAbortController: AbortController | null = null

  async function search(q: string) {
    const trimmed = q.trim()
    if (!trimmed) return

    activeAbortController?.abort()
    const requestId = ++requestSequence
    const abortController = new AbortController()
    activeAbortController = abortController
    const isCurrentRequest = () => requestId === requestSequence

    query.value = trimmed
    status.value = 'loading'
    trace.value = []
    sources.value = []
    result.value = null
    streamedAnswer.value = ''
    errorMessage.value = ''

    let response: Response
    try {
      response = await fetch('/api/search/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed }),
        signal: abortController.signal,
      })
    } catch {
      if (!isCurrentRequest() || abortController.signal.aborted) return
      status.value = 'error'
      errorMessage.value = '网络连接失败，请检查网络后重试'
      return
    }

    if (!response.ok) {
      if (!isCurrentRequest()) return
      status.value = 'error'
      errorMessage.value = `搜索请求失败：${response.status}`
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      if (!isCurrentRequest()) return
      status.value = 'error'
      errorMessage.value = '搜索流未返回可读数据'
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let receivedResult = false

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (!isCurrentRequest()) {
          await reader.cancel().catch(() => undefined)
          return
        }
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue

          const event = JSON.parse(line) as StreamEvent

          if (event.type === 'trace') {
            trace.value = event.trace
          } else if (event.type === 'sources_ready') {
            sources.value = event.sources
          } else if (event.type === 'answer_delta') {
            streamedAnswer.value += event.delta
          } else if (event.type === 'result') {
            result.value = event.result
            sources.value = event.result.sources
            streamedAnswer.value = event.result.answer || streamedAnswer.value
            receivedResult = true
          } else if (event.type === 'error') {
            status.value = 'error'
            errorMessage.value = event.message
            return
          }
        }
      }
    } catch {
      if (!isCurrentRequest() || abortController.signal.aborted) return
      status.value = 'error'
      errorMessage.value = '搜索流读取中断'
      return
    }

    if (!isCurrentRequest()) return

    if (receivedResult) {
      status.value = 'done'
    } else {
      status.value = 'error'
      errorMessage.value = '未收到搜索结果'
    }
  }

  function reset() {
    requestSequence++
    activeAbortController?.abort()
    activeAbortController = null
    query.value = ''
    status.value = 'idle'
    trace.value = []
    sources.value = []
    result.value = null
    streamedAnswer.value = ''
    errorMessage.value = ''
  }

  return {
    query,
    status,
    trace,
    sources,
    result,
    streamedAnswer,
    errorMessage,
    search,
    reset,
  }
}
