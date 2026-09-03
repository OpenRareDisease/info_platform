<template>
  <div class="search-page" :class="{ 'search-page--has-result': status !== 'idle' }">
    <div class="search-page__search-wrap">
      <SearchBar
        v-model="draft"
        :status="status"
        :examples="searchExamples"
        @submit="handleSubmit"
        @clear="handleClear"
        @example="handleExampleClick"
      />
    </div>
    <div v-if="status === 'loading' && !sources.length" class="search-page__section">
      <TraceSteps :trace="trace" :loading="true" />
    </div>
    <div v-if="displaySources.length || displayAnswer" class="search-page__section">
      <SourceList :sources="displaySources" />
      <AiAnswer
        :answer="displayAnswer"
        :streaming="status === 'loading'"
        :initially-expanded="result?.messageStatus === 'safety_routed'"
      />
    </div>
    <section v-if="status === 'error'" class="search-page__section search-page__section--error">
      <p class="search-page__error-msg">{{ errorMessage }}</p>
      <button class="search-page__retry-btn" @click="handleRetry">重试</button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSearch } from '~/composables/useSearch'
import SearchBar from '~/components/search/SearchBar.vue'
import TraceSteps from '~/components/search/TraceSteps.vue'
import SourceList from '~/components/search/SourceList.vue'
import AiAnswer from '~/components/search/AiAnswer.vue'

const draft = ref('')

const { query, status, trace, sources, result, streamedAnswer, errorMessage, search, reset } =
  useSearch()

const displaySources = computed(() => result.value?.sources || sources.value)
const displayAnswer = computed(() => result.value?.answer || streamedAnswer.value)

const searchExamples = ['FSHD最新治疗进展', '罕见病临床试验', '药物审批状态', '庞贝病基因治疗']

async function handleSubmit() {
  const trimmed = draft.value.trim()
  if (!trimmed || status.value === 'loading') return
  await search(trimmed)
}

function handleExampleClick(text: string) {
  draft.value = text
  search(text)
}

function handleClear() {
  draft.value = ''
  reset()
}

function handleRetry() {
  if (query.value) {
    search(query.value)
  }
}
</script>

<style scoped lang="scss">
@use '~/components/search/variables' as *;

.search-page {
  min-height: 100vh;
  background: $c-bg;
  color: $c-text;
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
  padding: 0 $space-m 60px;

  @include desktop {
    padding: 0 $space-l 60px;
  }
  display: flex;
  flex-direction: column;
}

.search-page:not(.search-page--has-result) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.search-page--has-result {
  padding-top: $space-l;

  @include desktop {
    padding-top: $space-xl;
  }
}

.search-page__search-wrap {
  width: 100%;
  max-width: 680px;
  margin: 0 auto;
}

.search-page--has-result .search-page__search-wrap {
  margin-bottom: $space-l;
}

.search-page__section {
  width: 100%;
  max-width: 680px;
  margin: 0 auto $space-l;
}

.search-page__section--error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
}

.search-page__error-msg {
  color: $c-text-secondary;
  font-weight: 600;
  margin: 0 0 $space-m;
}

.search-page__retry-btn {
  padding: $space-s $space-l;
  border: 1px solid $c-text-secondary;
  border-radius: 6px;
  background: $c-card-bg;
  color: $c-text-secondary;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: $c-red;
    color: #fff;
  }
}
</style>
