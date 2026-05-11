import { Module, forwardRef } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { CommonModule } from '../../common/common.module';
import { AuthModule } from '../../auth/auth.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [CommonModule, forwardRef(() => AuthModule), EmailModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
