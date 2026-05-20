import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { EmailService } from './email.service';
import { SendEmailDto } from './dto/send-email.dto';

@Controller('email')
@UseGuards(JwtAuthGuard)
export class EmailController {
  constructor(private readonly email: EmailService) {}

  @Post('send')
  async send(@Body() dto: SendEmailDto, @Request() req: any) {
    await this.email.send({
      to: dto.to,
      subject: dto.subject,
      text: dto.text,
      entityType: dto.entityType ?? null,
      entityId: dto.entityId ?? null,
      accountId: dto.accountId ?? null,
      contactId: dto.contactId ?? null,
      loggedByUserId: req.user.userId,
    });
    return { status: 'queued' };
  }
}
