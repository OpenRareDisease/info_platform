import type { RetrievedEvidenceItem } from './retrieval'
import { normalizeSearchQuery } from './query-normalization'

export function buildSearchPrompt(input: { query: string; evidence: RetrievedEvidenceItem[] }) {
  const normalized = normalizeSearchQuery(input.query)
  const primaryEvidence = input.evidence
    .filter(item => item.sourceTier !== 'internet_supplement')
    .slice(0, 4)
  const internetSupplementEvidence = input.evidence
    .filter(item => item.sourceTier === 'internet_supplement')
    .slice(0, 2)
  const knowledgeBaseEvidence = primaryEvidence.filter(
    item => item.sourceTier !== 'internet_supplement' && item.sourceLabel.includes('站内内容')
  )
  const authorityEvidence = primaryEvidence.filter(
    item => item.sourceTier !== 'internet_supplement' && !item.sourceLabel.includes('站内内容')
  )

  const formatEvidence = (
    item: RetrievedEvidenceItem,
    tierLabel: '站内内容' | '权威来源' | '互联网补充',
    limit: number
  ) => {
    const content = item.content.trim()
    const snippet = item.snippet.trim()
    let excerpt = content || snippet

    if (content && snippet && content !== snippet && !content.includes(snippet)) {
      const snippetBudget = Math.floor(limit / 2)
      const contentBudget = limit - snippetBudget
      excerpt = `命中摘要: ${snippet.slice(0, snippetBudget)}\n页面内容: ${content.slice(0, contentBudget)}`
    }

    return `[${tierLabel}｜${item.sourceLabel}] ${item.title}\nURL: ${item.sourceUrl}\n证据片段: ${excerpt.slice(0, limit)}`
  }

  const knowledgeBase = knowledgeBaseEvidence
    .map(item => formatEvidence(item, '站内内容', 360))
    .join('\n\n')

  const evidence = authorityEvidence.map(item => formatEvidence(item, '权威来源', 360)).join('\n\n')

  const internetSupplement = internetSupplementEvidence
    .map(item => formatEvidence(item, '互联网补充', 280))
    .join('\n\n')

  return `
你是一个罕见病信息聚合搜索助手。
要求：
- 第一段先直接回答搜索问题，不要空泛开场
- 使用通俗易懂的中文
- 不提供诊断或处方级建议
- 明确指出信息边界
- 结论必须尽量基于给定证据
- 站内内容是高优先级证据；引用病友经验或心理支持类内容时，明确它不是医学结论
- 优先使用权威来源得出结论
- 如果用了互联网补充信息，要明确说这是补充参考
- 如果没有证据，不要编造具体药名、技术名或研究项目名
- 指南落地页或仅说明指南存在的摘要，只能证明该指南的存在或官方属性；除非给定证据中包含具体推荐文本，不得仅凭这类证据推导具体药物、剂量或推荐强度等治疗结论
- 总字数控制在 500 到 800 个中文字符左右，避免重复证据和冗长背景
- 输出请严格按以下结构组织：
  1. 直接结论
  2. 当前已知信息
  3. 最新进展
  4. 建议继续搜索的方向

用户搜索词：
${input.query}

当前推断疾病主题：
${normalized.resolvedSubject || '未明确'}

推荐检索表达：
${normalized.effectiveQuery || input.query}

站内内容证据：
${knowledgeBase || '暂无站内内容证据'}

权威来源证据：
${evidence || '暂无权威证据'}

互联网补充：
${internetSupplement || '暂无互联网补充'}
`.trim()
}

export function buildSourceExplainPrompt(input: {
  title: string
  sourceLabel: string
  sourceUrl: string
  snippet: string
  content: string
}) {
  return `
你是一个把医学或科普网页内容翻译成大白话的中文助手。
要求：
- 只基于给定网页片段总结，不要编造片段里没有的信息
- 用简单、直接、像和普通人解释一样的中文
- 控制在 3 到 5 句话
- 第一 句话直接说“这条来源主要在讲什么”
- 如果内容涉及研究、治疗、诊断，请明确它是“研究进展/科普介绍/经验分享”中的哪一种
- 不要输出项目符号，不要使用“作为AI”

来源标题：${input.title}
来源站点：${input.sourceLabel}
来源链接：${input.sourceUrl}
已有摘要：${input.snippet || '无'}

网页相关片段：
${input.content}
`.trim()
}
