import { Module } from "@nestjs/common";

import { DatabaseModule } from "../db/database.module.js";
import { UsersRepository } from "./users.repository.js";
import { UsersService } from "./users.service.js";

@Module({
  imports: [DatabaseModule],
  providers: [UsersRepository, UsersService],
  exports: [UsersService, UsersRepository]
})
export class UsersModule {}
