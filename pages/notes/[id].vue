<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'

const route = useRoute()

const id = computed(() => route.params.id)

const { data: note, pending, error } = await useFetch(`/api/notes/${id.value}`)

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
})

const mdContent = computed(() => md.render(note.value?.content ?? ''))
</script>

<template>
  <div class="note-detail">
    <NuxtLink to="/" class="back-btn">← Back</NuxtLink>

    <p v-if="pending">Loading...</p>
    <p v-else-if="error">Failed to load note</p>

    <template v-else>
      <div class="content" v-html="mdContent" />
    </template>
  </div>
</template>

<style scoped lang="scss">
.note-detail {
  padding: 24px;

  .back-btn {
    display: inline-block;
    margin-bottom: 16px;
    color: #555;
    text-decoration: none;
    font-size: 20px;

    &:hover {
      text-decoration: underline;
    }
  }

  .content {
    line-height: 1.7;
  }
}
</style>
