<template>
  <div style="padding: 20px; font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto">
    <h1>Notes App</h1>

    <!-- Add Note Form -->
    <div
      style="
        margin-bottom: 30px;
        padding: 20px;
        border: 2px solid #4caf50;
        border-radius: 8px;
        background: #f0f8f0;
      "
    >
      <h2 style="margin-top: 0">Add New Note</h2>
      <form @submit.prevent="submitNote">
        <input
          v-model="newMessage"
          type="text"
          placeholder="Enter your note message..."
          style="
            width: 100%;
            padding: 12px;
            font-size: 16px;
            border: 1px solid #ddd;
            border-radius: 4px;
            margin-bottom: 10px;
          "
          :disabled="submitting"
        />
        <button
          type="submit"
          :disabled="!newMessage.trim() || submitting"
          style="
            padding: 12px 24px;
            font-size: 16px;
            background: #4caf50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          "
          :style="{ opacity: !newMessage.trim() || submitting ? 0.5 : 1 }"
        >
          {{ submitting ? 'Submitting...' : 'Add Note' }}
        </button>
      </form>
      <p v-if="submitError" style="color: red; margin-top: 10px">{{ submitError }}</p>
      <p v-if="submitSuccess" style="color: green; margin-top: 10px">Note added successfully!</p>
    </div>

    <!-- Notes List -->
    <h2>All Notes</h2>

    <div v-if="pending">
      <p>Loading notes...</p>
    </div>

    <div v-else-if="error">
      <p style="color: red">Error: {{ error.message }}</p>
    </div>

    <div v-else>
      <div v-if="data?.notes && data.notes.length > 0">
        <ul style="list-style: none; padding: 0">
          <li
            v-for="note in data.notes"
            :key="note.id"
            style="
              padding: 15px;
              margin: 10px 0;
              border: 1px solid #ddd;
              border-radius: 8px;
              background: #f9f9f9;
            "
          >
            <NuxtLink :to="`/notes/${note.id}`" class="note-link">
              <h3>{{ note.title }}</h3>
            </NuxtLink>
          </li>
        </ul>
      </div>
      <div v-else>
        <p>No notes found. Add your first note above!</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { data, pending, error, refresh } = await useFetch('/api/notes')

const newMessage = ref('')
const submitting = ref(false)
const submitError = ref('')
const submitSuccess = ref(false)

const submitNote = async () => {
  if (!newMessage.value.trim()) return

  submitting.value = true
  submitError.value = ''
  submitSuccess.value = false

  try {
    await $fetch('/api/notes', {
      method: 'POST',
      body: {
        message: newMessage.value.trim(),
      },
    })

    submitSuccess.value = true
    newMessage.value = ''

    // Refresh the notes list
    await refresh()

    // Clear success message after 3 seconds
    setTimeout(() => {
      submitSuccess.value = false
    }, 3000)
  } catch (err: any) {
    submitError.value = err.message || 'Failed to add note'
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped lang="scss">
.note-link {
  display: block;
  color: inherit;
  text-decoration: none;

  h3 {
    margin: 0;
  }
}
</style>
