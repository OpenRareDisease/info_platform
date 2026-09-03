import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import SearchPage from './search.vue'
import type { SearchSource } from '~/types/search'

// ── Mock useSearch composable ─────────────────────────────────────────────
const mockSearch = vi.fn()
const mockReset = vi.fn()

const mockQuery = ref('')
const mockStatus = ref<'idle' | 'loading' | 'done' | 'error'>('idle')
const mockTrace = ref<any[]>([])
const mockSources = ref<SearchSource[]>([])
const mockResult = ref<any>(null)
const mockStreamedAnswer = ref('')
const mockErrorMessage = ref('')

vi.mock('~/composables/useSearch', () => ({
  useSearch: () => ({
    query: mockQuery,
    status: mockStatus,
    trace: mockTrace,
    sources: mockSources,
    result: mockResult,
    streamedAnswer: mockStreamedAnswer,
    errorMessage: mockErrorMessage,
    search: mockSearch,
    reset: mockReset,
  }),
}))

function resetMocks() {
  mockQuery.value = ''
  mockStatus.value = 'idle'
  mockTrace.value = []
  mockSources.value = []
  mockResult.value = null
  mockStreamedAnswer.value = ''
  mockErrorMessage.value = ''
  mockSearch.mockReset()
  mockReset.mockReset()
}

function makeSource(overrides: Record<string, any> = {}) {
  return {
    title: '来源标题',
    sourceType: 'reference',
    sourceTier: 'internet_supplement' as const,
    sourceLabel: 'PubMed',
    sourceUrl: 'https://example.com/' + Math.random(),
    sourceDomain: 'example.com',
    snippet: '摘要内容',
    publishedAt: null,
    rank: 1,
    ...overrides,
  }
}

const sampleResult = {
  query: '测试查询',
  answer: '第一段解读内容\n\n第二段解读内容',
  messageStatus: 'completed',
  sources: [
    makeSource({
      title: '权威来源标题',
      sourceTier: 'authority',
      sourceLabel: 'NORD',
      sourceUrl: 'https://nord.example.com/article',
      rank: 1,
    }),
    makeSource({
      title: '互联网来源标题',
      sourceLabel: 'PubMed',
      sourceUrl: 'https://pubmed.example.com/article',
      rank: 2,
    }),
  ],
  searchTrace: [],
}

// 5 条来源，用于测试折叠
const foldResult = {
  ...sampleResult,
  sources: Array.from({ length: 5 }, (_, i) =>
    makeSource({ title: `来源${i + 1}`, sourceUrl: `https://example.com/${i}`, rank: i + 1 })
  ),
}

describe('search.vue', () => {
  beforeEach(() => {
    resetMocks()
  })

  // ── Idle state ────────────────────────────────────────────────────────

  it('renders heading and search examples in idle state', () => {
    const wrapper = mount(SearchPage)
    expect(wrapper.find('.search-bar__heading').exists()).toBe(true)
    expect(wrapper.text()).toContain('OpenRD')
    expect(wrapper.text()).toContain('罕见病信息检索')
    expect(wrapper.text()).toContain('搜索示例')
    expect(wrapper.findAll('.search-bar__example-tag').length).toBe(4)
  })

  it('does not render result or error sections in idle state', () => {
    const wrapper = mount(SearchPage)
    expect(wrapper.find('.trace-steps').exists()).toBe(false)
    expect(wrapper.find('.source-list').exists()).toBe(false)
    expect(wrapper.find('.search-page__section--error').exists()).toBe(false)
  })

  // ── Search submit ───────────────────────────────────────────────────

  it('calls search on form submit with trimmed value', async () => {
    const wrapper = mount(SearchPage)
    const input = wrapper.find('.search-bar__input')
    await input.setValue('  FSHD 治疗  ')
    await wrapper.find('.search-bar__form').trigger('submit')

    expect(mockSearch).toHaveBeenCalledWith('FSHD 治疗')
  })

  it('does not call search with empty input', async () => {
    const wrapper = mount(SearchPage)
    await wrapper.find('.search-bar__input').setValue('   ')
    await wrapper.find('.search-bar__form').trigger('submit')

    expect(mockSearch).not.toHaveBeenCalled()
  })

  it('fills input and triggers search on example tag click', async () => {
    const wrapper = mount(SearchPage)
    const tags = wrapper.findAll('.search-bar__example-tag')
    await tags[0].trigger('click')

    expect(mockSearch).toHaveBeenCalledWith('FSHD最新治疗进展')
  })

  // ── Clear button ────────────────────────────────────────────────────

  it('does not show clear button in idle state', () => {
    const wrapper = mount(SearchPage)
    expect(wrapper.find('.search-bar__clear').exists()).toBe(false)
  })

  it('shows clear button when not idle and resets on click', async () => {
    mockStatus.value = 'done'
    mockResult.value = sampleResult

    const wrapper = mount(SearchPage)
    await flushPromises()

    const clearBtn = wrapper.find('.search-bar__clear')
    expect(clearBtn.exists()).toBe(true)

    await clearBtn.trigger('click')
    expect(mockReset).toHaveBeenCalled()
  })

  // ── Loading state ───────────────────────────────────────────────────

  it('shows trace steps during loading', async () => {
    mockStatus.value = 'loading'
    mockTrace.value = [
      { key: 'local', label: '站内搜索', status: 'success', detail: '3 条' },
      { key: 'auth', label: '权威来源', status: 'empty', detail: '0 条' },
    ]

    const wrapper = mount(SearchPage)
    await flushPromises()

    expect(wrapper.text()).toContain('检索进行中')
    const steps = wrapper.findAll('.trace-steps__item')
    expect(steps.length).toBe(2)
    expect(steps[0].classes()).toContain('trace-steps__item--done')
    expect(steps[1].classes()).toContain('trace-steps__item--active')
  })

  it('shows sources as soon as retrieval finishes while the final result is pending', async () => {
    mockStatus.value = 'loading'
    mockSources.value = sampleResult.sources

    const wrapper = mount(SearchPage)
    await flushPromises()

    expect(wrapper.findAll('.source-card')).toHaveLength(2)
    expect(wrapper.text()).toContain('信息来源')
    expect(wrapper.find('.trace-steps').exists()).toBe(false)
    expect(wrapper.find('.ai-answer__trigger').exists()).toBe(true)
  })

  it('keeps a streaming AI answer collapsed until requested and open after completion', async () => {
    mockStatus.value = 'loading'
    mockSources.value = sampleResult.sources
    mockStreamedAnswer.value = '正在生成的第一段回答'

    const wrapper = mount(SearchPage)
    await flushPromises()

    expect(wrapper.find('.ai-answer__body').exists()).toBe(false)
    await wrapper.find('.ai-answer__trigger').trigger('click')

    expect(wrapper.find('.ai-answer__body').exists()).toBe(true)
    expect(wrapper.text()).toContain('AI 正在整理')
    expect(wrapper.text()).toContain('正在生成的第一段回答')
    expect(wrapper.find('.ai-answer__trigger').exists()).toBe(false)

    mockStatus.value = 'done'
    mockResult.value = sampleResult
    await flushPromises()

    expect(wrapper.find('.ai-answer__body').exists()).toBe(true)
    expect(wrapper.text()).toContain('AI 解读')
    expect(wrapper.text()).toContain('第一段解读内容')
  })

  it('hides heading and examples during loading', async () => {
    mockStatus.value = 'loading'
    const wrapper = mount(SearchPage)
    await flushPromises()

    expect(wrapper.find('.search-bar__heading').exists()).toBe(false)
    expect(wrapper.find('.search-bar__examples').exists()).toBe(false)
  })

  it('disables input during loading', async () => {
    mockStatus.value = 'loading'
    const wrapper = mount(SearchPage)
    await flushPromises()

    const input = wrapper.find('.search-bar__input').element as HTMLInputElement
    expect(input.disabled).toBe(true)
  })

  // ── Done state ──────────────────────────────────────────────────────

  it('shows source cards in done state', async () => {
    mockStatus.value = 'done'
    mockResult.value = sampleResult

    const wrapper = mount(SearchPage)
    await flushPromises()

    expect(wrapper.text()).toContain('信息来源')
    const cards = wrapper.findAll('.source-card')
    expect(cards.length).toBe(2)

    // Authority tag
    expect(cards[0].find('.source-card__tier--authority').exists()).toBe(true)
    expect(cards[0].text()).toContain('权威来源')
    expect(cards[0].text()).toContain('NORD')

    // Supplement tag
    expect(cards[1].find('.source-card__tier--supplement').exists()).toBe(true)
    expect(cards[1].text()).toContain('互联网补充')
  })

  // ── Source fold ─────────────────────────────────────────────────────

  it('folds sources to 3 by default and expands on click', async () => {
    mockStatus.value = 'done'
    mockResult.value = foldResult

    const wrapper = mount(SearchPage)
    await flushPromises()

    // 默认只显示 3 条
    expect(wrapper.findAll('.source-card').length).toBe(3)

    // 展开按钮存在
    const toggleBtn = wrapper.find('.source-list__toggle')
    expect(toggleBtn.exists()).toBe(true)
    expect(toggleBtn.text()).toContain('展开更多')
    expect(toggleBtn.text()).toContain('共5条')

    // 点击展开
    await toggleBtn.trigger('click')
    expect(wrapper.findAll('.source-card').length).toBe(5)
    expect(wrapper.find('.source-list__toggle').text()).toContain('收起')

    // 点击收起
    await wrapper.find('.source-list__toggle').trigger('click')
    expect(wrapper.findAll('.source-card').length).toBe(3)
  })

  it('does not show fold toggle when sources <= 3', async () => {
    mockStatus.value = 'done'
    mockResult.value = sampleResult // 2 条

    const wrapper = mount(SearchPage)
    await flushPromises()

    expect(wrapper.find('.source-list__toggle').exists()).toBe(false)
  })

  it('shows "一键解读" button hidden by default; toggles answer', async () => {
    mockStatus.value = 'done'
    mockResult.value = sampleResult

    const wrapper = mount(SearchPage)
    await flushPromises()

    // Answer hidden initially
    expect(wrapper.find('.ai-answer__body').exists()).toBe(false)
    const interpretBtn = wrapper.find('.ai-answer__trigger')
    expect(interpretBtn.exists()).toBe(true)
    expect(interpretBtn.text()).toContain('一键解读')

    // Click to show
    await interpretBtn.trigger('click')
    expect(wrapper.find('.ai-answer__body').exists()).toBe(true)
    expect(wrapper.text()).toContain('第一段解读内容')
    expect(wrapper.text()).toContain('第二段解读内容')
    expect(wrapper.find('.ai-answer__trigger').exists()).toBe(false)

    // Collapse
    await wrapper.find('.ai-answer__collapse').trigger('click')
    expect(wrapper.find('.ai-answer__body').exists()).toBe(false)
    expect(wrapper.find('.ai-answer__trigger').exists()).toBe(true)
  })

  it('does not show AI answer section when no sources', async () => {
    mockStatus.value = 'done'
    mockResult.value = { ...sampleResult, sources: [], answer: '' }

    const wrapper = mount(SearchPage)
    await flushPromises()

    expect(wrapper.find('.source-list').exists()).toBe(false)
    expect(wrapper.find('.ai-answer__trigger').exists()).toBe(false)
  })

  it('shows a safety-routed answer even when there are no sources', async () => {
    mockStatus.value = 'done'
    mockResult.value = {
      ...sampleResult,
      sources: [],
      answer: '请立即联系当地急救服务或可信赖的人陪伴你。',
      messageStatus: 'safety_routed',
    }

    const wrapper = mount(SearchPage)
    await flushPromises()

    expect(wrapper.find('.source-list').exists()).toBe(false)
    expect(wrapper.find('.ai-answer__body').exists()).toBe(true)
    expect(wrapper.text()).toContain('请立即联系当地急救服务或可信赖的人陪伴你。')
  })

  // ── Error state ─────────────────────────────────────────────────────

  it('shows error message and retry button', async () => {
    mockStatus.value = 'error'
    mockErrorMessage.value = '搜索请求失败：500'

    const wrapper = mount(SearchPage)
    await flushPromises()

    expect(wrapper.find('.search-page__section--error').exists()).toBe(true)
    expect(wrapper.text()).toContain('搜索请求失败：500')
    expect(wrapper.find('.search-page__retry-btn').exists()).toBe(true)
  })

  it('calls search with previous query on retry', async () => {
    mockStatus.value = 'error'
    mockQuery.value = '庞贝病'
    mockErrorMessage.value = '网络连接失败'

    const wrapper = mount(SearchPage)
    await flushPromises()

    await wrapper.find('.search-page__retry-btn').trigger('click')
    expect(mockSearch).toHaveBeenCalledWith('庞贝病')
  })

  // ── Layout ──────────────────────────────────────────────────────────

  it('applies ask--has-result class when not idle', async () => {
    mockStatus.value = 'done'
    mockResult.value = sampleResult

    const wrapper = mount(SearchPage)
    await flushPromises()

    expect(wrapper.find('.search-page--has-result').exists()).toBe(true)
  })

  it('does not have ask--has-result class when idle', () => {
    const wrapper = mount(SearchPage)
    expect(wrapper.find('.search-page--has-result').exists()).toBe(false)
  })
})
