import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async event => {
  // Get Supabase client from Nuxt module
  const supabase = await serverSupabaseClient(event)

  // Get the message from request body
  const body = await readBody(event)
  const message = body?.message

  if (!message || typeof message !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Message is required and must be a string',
    })
  }

  // Insert note into Supabase
  const { data, error } = await supabase
    .from('notes')
    .insert({
      title: message,
    } as any)
    .select()

  if (error) {
    console.log('Supabase insert error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create note in Supabase',
      data: error,
    })
  }

  return {
    success: true,
    note: data?.[0] || data,
  }
})
