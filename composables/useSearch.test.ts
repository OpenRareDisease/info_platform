import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSearch } from './useSearch'
import type { SearchResponse, SearchTraceEntry } from '~/types/search'

// 构造一个模拟的 ReadableStream
function createMockStream(events: string[]) {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < events.length) {
        controller.enqueue(encoder.encode(events[index] + '\n'))
        index++
      } else {
        controller.close()
      }
    },
  })
}

function mockFetchStream(events: string[], status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    body: createMockStream(events),
  } as unknown as Response)
}

const traceEvent: SearchTraceEntry[] = [
  { key: 'local-notes', label: '站内知识库检索', status: 'empty', detail: '未命中知识库结果' },
]

const resultEvent: SearchResponse = {
  query: '测试搜索',
  answer: '这是 AI 总结',
  messageStatus: 'completed',
  sources: [
    {
      title: '测试来源',
      sourceType: 'reference',
      sourceTier: 'authority',
      sourceLabel: 'NORD',
      sourceUrl: 'https://example.com',
      sourceDomain: 'example.com',
      snippet: '摘要',
      publishedAt: null,
      rank: 1,
    },
  ],
  searchTrace: traceEvent,
}

describe('useSearch', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('初始状态正确', () => {
    const { query, status, trace, sources, result, streamedAnswer, errorMessage } = useSearch()

    expect(query.value).toBe('')
    expect(status.value).toBe('idle')
    expect(trace.value).toEqual([])
    expect(sources.value).toEqual([])
    expect(result.value).toBeNull()
    expect(streamedAnswer.value).toBe('')
    expect(errorMessage.value).toBe('')
  })

  it('收到 sources_ready 时在最终结果前提供来源', async () => {
    const encoder = new TextEncoder()
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
      },
    })
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, body } as Response)

    const { status, sources, result, search } = useSearch()
    const searchPromise = search('测试')

    await vi.waitFor(() => expect(streamController).toBeDefined())
    streamController?.enqueue(
      encoder.encode(`${JSON.stringify({ type: 'sources_ready', sources: resultEvent.sources })}\n`)
    )

    await vi.waitFor(() => expect(sources.value).toEqual(resultEvent.sources))
    expect(status.value).toBe('loading')
    expect(result.value).toBeNull()

    streamController?.enqueue(
      encoder.encode(`${JSON.stringify({ type: 'result', result: resultEvent })}\n`)
    )
    streamController?.close()
    await searchPromise
  })

  it('收到答案增量时立即更新 streamedAnswer', async () => {
    const encoder = new TextEncoder()
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
      },
    })
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, body } as Response)

    const { streamedAnswer, search } = useSearch()
    const searchPromise = search('测试')

    await vi.waitFor(() => expect(streamController).toBeDefined())
    streamController?.enqueue(
      encoder.encode(`${JSON.stringify({ type: 'answer_delta', delta: '正在生成第一段' })}\n`)
    )
    await vi.waitFor(() => expect(streamedAnswer.value).toBe('正在生成第一段'))

    streamController?.enqueue(
      encoder.encode(`${JSON.stringify({ type: 'result', result: resultEvent })}\n`)
    )
    streamController?.close()
    await searchPromise
  })

  it('搜索时状态切换到 loading', async () => {
    const events = [JSON.stringify({ type: 'result', result: resultEvent })]
    globalThis.fetch = mockFetchStream(events)

    const { status, search } = useSearch()

    const promise = search('测试')
    expect(status.value).toBe('loading')
    await promise
  })

  it('搜索完成后状态切换到 done', async () => {
    const events = [
      JSON.stringify({ type: 'trace', trace: traceEvent }),
      JSON.stringify({ type: 'result', result: resultEvent }),
    ]
    globalThis.fetch = mockFetchStream(events)

    const { status, trace, result, search } = useSearch()

    await search('测试')

    expect(status.value).toBe('done')
    expect(trace.value).toEqual(traceEvent)
    expect(result.value).toEqual(resultEvent)
  })

  it('空输入不触发搜索', async () => {
    globalThis.fetch = vi.fn()
    const { status, search } = useSearch()

    await search('')
    expect(status.value).toBe('idle')
    expect(globalThis.fetch).not.toHaveBeenCalled()

    await search('   ')
    expect(status.value).toBe('idle')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('HTTP 错误时状态切换到 error', async () => {
    globalThis.fetch = mockFetchStream([], 500)

    const { status, errorMessage, search } = useSearch()

    await search('测试')

    expect(status.value).toBe('error')
    expect(errorMessage.value).toContain('500')
  })

  it('流式 error 事件处理', async () => {
    const events = [JSON.stringify({ type: 'error', message: '搜索失败' })]
    globalThis.fetch = mockFetchStream(events)

    const { status, errorMessage, search } = useSearch()

    await search('测试')

    expect(status.value).toBe('error')
    expect(errorMessage.value).toBe('搜索失败')
  })

  it('未收到结果时状态切换到 error', async () => {
    const events = [JSON.stringify({ type: 'trace', trace: traceEvent })]
    globalThis.fetch = mockFetchStream(events)

    const { status, errorMessage, search } = useSearch()

    await search('测试')

    expect(status.value).toBe('error')
    expect(errorMessage.value).toBe('未收到搜索结果')
  })

  it('网络连接失败时状态切换到 error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'))

    const { status, errorMessage, search } = useSearch()

    await search('测试')

    expect(status.value).toBe('error')
    expect(errorMessage.value).toContain('网络连接失败')
  })

  it('reset 恢复到初始状态', async () => {
    const events = [JSON.stringify({ type: 'result', result: resultEvent })]
    globalThis.fetch = mockFetchStream(events)

    const { query, status, trace, sources, result, streamedAnswer, errorMessage, search, reset } =
      useSearch()

    await search('测试')
    expect(status.value).toBe('done')

    reset()
    expect(query.value).toBe('')
    expect(status.value).toBe('idle')
    expect(trace.value).toEqual([])
    expect(sources.value).toEqual([])
    expect(result.value).toBeNull()
    expect(streamedAnswer.value).toBe('')
    expect(errorMessage.value).toBe('')
  })

  it('reset 后取消并忽略仍在返回的旧搜索', async () => {
    const encoder = new TextEncoder()
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined
    let requestSignal: AbortSignal | undefined
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
      },
    })
    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      requestSignal = init?.signal
      return Promise.resolve({ ok: true, status: 200, body } as Response)
    })

    const { status, sources, result, streamedAnswer, search, reset } = useSearch()
    const searchPromise = search('旧搜索')
    await vi.waitFor(() => expect(streamController).toBeDefined())
    reset()

    expect(requestSignal?.aborted).toBe(true)
    streamController?.enqueue(
      encoder.encode(`${JSON.stringify({ type: 'answer_delta', delta: '旧回答' })}\n`)
    )
    streamController?.close()
    await searchPromise

    expect(status.value).toBe('idle')
    expect(sources.value).toEqual([])
    expect(result.value).toBeNull()
    expect(streamedAnswer.value).toBe('')
  })

  it('query ref 更新为搜索词', async () => {
    const events = [JSON.stringify({ type: 'result', result: resultEvent })]
    globalThis.fetch = mockFetchStream(events)

    const { query, search } = useSearch()

    await search('  FSHD 治疗  ')
    expect(query.value).toBe('FSHD 治疗')
  })
})
