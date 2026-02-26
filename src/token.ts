import { sign, verify } from 'jsonwebtoken'

type TokenParts = {
  runId: string
  stepId: string
}

type DecodeTokenParams = {
  token: string
  secret: string
}

export const encodeToken = ({
  runId,
  stepId,
  secret,
}: TokenParts & { secret: string }) => {
  return sign({ runId, stepId }, secret, {
    algorithm: 'HS256',
    noTimestamp: true,
  })
}

export const decodeAndVerifyToken = ({
  token,
  secret,
}: DecodeTokenParams): TokenParts | null => {
  try {
    const decoded = verify(token, secret, { algorithms: ['HS256'] })
    if (!decoded || typeof decoded === 'string') {
      return null
    }

    const runId = decoded.runId
    const stepId = decoded.stepId
    if (typeof runId !== 'string' || typeof stepId !== 'string') {
      return null
    }

    return { runId, stepId }
  } catch {
    return null
  }
}
