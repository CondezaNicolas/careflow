import { Module } from "@nestjs/common";

import { DatabaseModule } from "../db/database.module.js";
import { UsersModule } from "../users/users.module.js";
import { AdminRepository } from "./admin.repository.js";
import { AdminService } from "./admin.service.js";
import { AdminController } from "./admin.controller.js";

@Module({
  imports: [DatabaseModule, UsersModule],
  providers: [AdminRepository, AdminService],
  controllers: [AdminController]
})
export class AdminModule {}
