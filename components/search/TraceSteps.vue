<template>
  <section class="trace-steps">
    <div class="trace-steps__header">
      <h2 class="trace-steps__title">检索进行中</h2>
      <p class="trace-steps__subtitle">正在依次执行来源检索和大模型聚合整理。</p>
    </div>

    <TransitionGroup
      v-if="trace.length"
      tag="div"
      name="trace-enter"
      class="trace-steps__list"
      aria-live="polite"
    >
      <article
        v-for="(step, idx) in trace"
        :key="step.key"
        class="trace-steps__item"
        :class="{
          'trace-steps__item--active': loading && idx === trace.length - 1,
          'trace-steps__item--done':
            step.status !== 'error' && !(loading && idx === trace.length - 1),
          'trace-steps__item--error': step.status === 'error',
        }"
      >
        <span class="trace-steps__dot" />
        <div>
          <p class="trace-steps__label">{{ step.label }}</p>
          <p class="trace-steps__detail">{{ step.detail }}</p>
        </div>
      </article>
    </TransitionGroup>
  </section>
</template>

<script setup lang="ts">
import type { SearchTraceEntry } from '~/types/search'

defineProps<{
  trace: SearchTraceEntry[]
  loading: boolean
}>()
</script>

<style scoped lang="scss">
@use 'variables' as *;

.trace-steps {
  width: 100%;
}

.trace-steps__header {
  margin-bottom: $space-m;
}

.trace-steps__title {
  margin: 0 0 $space-xs;
  font-size: 15px;
  font-weight: 700;
  color: $c-text;

  @include desktop {
    font-size: 16px;
  }
}

.trace-steps__subtitle {
  margin: 0;
  color: $c-text-secondary;
  font-size: 13px;
  line-height: 1.7;

  @include desktop {
    font-size: 14px;
  }
}

.trace-steps__list {
  display: grid;
  gap: $space-s;
  position: relative;

  @include desktop {
    gap: $space-m;
  }
}

.trace-steps__item {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  gap: $space-s;
  align-items: start;
  padding: 10px 12px;
  border-radius: $radius;
  background: $c-card-bg;
  border: 1px solid $c-border;
  opacity: 0.72;
  transition:
    opacity 0.2s ease,
    transform 0.2s ease,
    border-color 0.2s ease,
    background 0.2s ease;

  @include desktop {
    grid-template-columns: 16px minmax(0, 1fr);
    gap: $space-m;
    padding: 12px $space-m;
  }
}

.trace-steps__item--active,
.trace-steps__item--done {
  opacity: 1;
}

.trace-steps__item--active {
  border-color: rgba($c-primary, 0.35);
  background: rgba($c-primary, 0.04);
  transform: translateY(-1px);
  box-shadow: $c-card-shadow;
}

.trace-steps__item--done {
  border-color: rgba($c-primary, 0.18);
}

.trace-steps__item--error {
  opacity: 1;
  border-color: rgba($c-red, 0.35);
  background: $c-red-bg;
}

.trace-steps__dot {
  width: 10px;
  height: 10px;
  margin-top: 4px;
  border-radius: 50%;
  background: $c-text-muted;
  box-shadow: 0 0 0 3px rgba($c-text-muted, 0.2);
  flex-shrink: 0;

  @include desktop {
    width: 12px;
    height: 12px;
    box-shadow: 0 0 0 4px rgba($c-text-muted, 0.2);
  }
}

.trace-steps__item--active .trace-steps__dot {
  background: $c-primary;
  box-shadow: 0 0 0 4px rgba($c-primary, 0.16);
  animation: pulse 1.4s ease-in-out infinite;

  @include desktop {
    box-shadow: 0 0 0 5px rgba($c-primary, 0.16);
  }
}

.trace-steps__item--done .trace-steps__dot {
  background: $c-primary;
  box-shadow: 0 0 0 4px rgba($c-primary, 0.12);

  @include desktop {
    box-shadow: 0 0 0 5px rgba($c-primary, 0.12);
  }
}

.trace-steps__item--error .trace-steps__dot {
  background: $c-red;
  box-shadow: 0 0 0 4px rgba($c-red, 0.12);

  @include desktop {
    box-shadow: 0 0 0 5px rgba($c-red, 0.12);
  }
}

.trace-steps__label {
  margin: 0 0 2px;
  font-weight: 600;
  color: $c-text;
  font-size: 13px;

  @include desktop {
    font-size: 14px;
  }
}

.trace-steps__detail {
  margin: 0;
  color: $c-text-secondary;
  font-size: 12px;

  @include desktop {
    font-size: 13px;
  }
}

// ── 渐入动画 ──────────────────────────────────────────────────────────────

.trace-enter-enter-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.trace-enter-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

// ── 脉冲动画 ──────────────────────────────────────────────────────────────

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.35);
  }
}
</style>
