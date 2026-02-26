import { z } from 'zod'

const isoDateTimeWithOffsetSchema = z.string().datetime({ offset: true })

const isValidIsoDateTime = (value) =>
  isoDateTimeWithOffsetSchema.safeParse(value).success

export const MATCH_STATUS = {
  SCHEDULED: 'scheduled',
  LIVE: 'live',
  FINISHED: 'finished',
}

export const listMatchesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
})

export const matchIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const createMatchSchema = z
  .object({
    sport: z.string().trim().min(1),
    homeTeam: z.string().trim().min(1),
    awayTeam: z.string().trim().min(1),
    startTime: z
      .string()
      .refine(isValidIsoDateTime, { message: 'startTime must be a valid ISO date string' }),
    endTime: z
      .string()
      .refine(isValidIsoDateTime, { message: 'endTime must be a valid ISO date string' }),
    homeScore: z.coerce.number().int().nonnegative().optional(),
    awayScore: z.coerce.number().int().nonnegative().optional(),
  })
  .superRefine((value, ctx) => {
    const start = new Date(value.startTime).getTime()
    const end = new Date(value.endTime).getTime()

    if (end <= start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'endTime must be after startTime',
      })
    }
  })

export const updateScoreSchema = z.object({
  homeScore: z.coerce.number().int().nonnegative(),
  awayScore: z.coerce.number().int().nonnegative(),
})
