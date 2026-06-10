import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

// The browser EventSource API can't set an Authorization header, so the SSE notification
// stream is the only place a ?token= query param is accepted. Everywhere else only the
// Authorization header is honored (avoids leaking tokens into access logs / Referer).
const fromSseQuery = (req: any): string | null => {
  const url: string = req?.originalUrl || req?.url || '';
  if (url.includes('/notifications/stream')) {
    return req?.query?.token || null;
  }
  return null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        fromSseQuery,
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'dev_secret',
    });
  }

  async validate(payload: any) {
    return { userId: payload.sub, role: payload.role };
  }
}
