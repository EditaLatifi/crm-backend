import { Injectable } from '@nestjs/common';
import { Response } from 'express';

@Injectable()
export class NotificationsGateway {
  private streams = new Map<string, Response[]>();

  addStream(userId: string, res: Response) {
    const existing = this.streams.get(userId) || [];
    this.streams.set(userId, [...existing, res]);
  }

  removeStream(userId: string, res: Response) {
    const existing = this.streams.get(userId) || [];
    const updated = existing.filter(r => r !== res);
    if (updated.length === 0) {
      this.streams.delete(userId);
    } else {
      this.streams.set(userId, updated);
    }
  }

  push(userId: string, payload: object) {
    const streams = this.streams.get(userId);
    if (!streams || streams.length === 0) return;
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of streams) {
      try {
        res.write(data);
      } catch {
        // stream closed, will be cleaned up on disconnect
      }
    }
  }
}
