import { Controller, Get, Inject, Post, Query, Body } from "@nestjs/common";

import { Roles } from "../auth/decorators/roles.decorator.js";
import { USER_ROLE } from "../common/constants/user-role.js";
import { SearchQueryDto } from "./dtos/search.dto.js";
import { CreateUserRequestDto } from "./dtos/create-user.dto.js";
import { AdminService } from "./admin.service.js";

@Controller("admin")
@Roles(USER_ROLE.ADMIN)
export class AdminController {
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

  @Get("tenants")
  listTenants() {
    return this.adminService.listTenants();
  }

  @Get("search")
  search(@Query() query: SearchQueryDto) {
    return this.adminService.search(query.q, query.types);
  }

  @Post("users")
  async createUser(@Body() body: CreateUserRequestDto) {
    return this.adminService.createUser(body.email, body.password, body.role, body.tenantId);
  }
}
