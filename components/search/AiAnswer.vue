<template>
  <div v-if="answer || streaming" class="ai-answer">
    <button v-if="!showAnswer" class="ai-answer__trigger" @click="showAnswer = true">
      AI一键解读
    </button>

    <div v-if="showAnswer" class="ai-answer__body">
      <h3 class="ai-answer__heading">{{ streaming ? 'AI 正在整理ing' : 'AI 解读' }}</h3>
      <p v-for="(paragraph, idx) in paragraphs" :key="idx" class="ai-answer__text">
        {{ paragraph }}
      </p>
      <button class="ai-answer__collapse" @click="showAnswer = false">收起解读</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  answer: string
  streaming?: boolean
  initiallyExpanded?: boolean
}>()

const showAnswer = ref(props.initiallyExpanded || false)

const paragraphs = computed(() =>
  props.answer
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
)
</script>

<style scoped lang="scss">
@use 'variables' as *;

.ai-answer {
  margin-top: $space-l;
}

.ai-answer__trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px $space-l;
  border: 1px solid $c-primary;
  border-radius: $radius;
  background: rgba($c-primary, 0.04);
  color: $c-primary;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: rgba($c-primary, 0.1);
  }
}

.ai-answer__body {
  padding: $space-m;
  border-radius: $radius;
  background: $c-card-bg;
  border: 1px solid $c-border;
  box-shadow: $c-card-shadow;

  @include desktop {
    padding: $space-l;
  }
}

.ai-answer__heading {
  font-size: 15px;
  font-weight: 700;
  color: $c-text;
  margin: 0 0 $space-m;
}

.ai-answer__text {
  font-size: 14px;
  line-height: 1.7;
  color: $c-text;
  margin: 0 0 $space-m;

  @include desktop {
    font-size: 15px;
  }

  &:last-of-type {
    margin-bottom: $space-m;
  }
}

.ai-answer__collapse {
  padding: 0;
  border: none;
  background: none;
  color: $c-text-muted;
  font-size: 13px;
  cursor: pointer;

  &:hover {
    color: $c-text-secondary;
  }
}
</style>
