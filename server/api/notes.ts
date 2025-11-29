import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async event => {
  // Get Supabase client from Nuxt module
  const supabase = await serverSupabaseClient(event)

  // Fetch all notes from Supabase
  const { data, error } = await supabase.from('notes').select('*')

  if (error) {
    console.log('Supabase fetch error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch notes from Supabase',
      data: error,
    })
  }

  return {
    notes: data || [],
  }
})
