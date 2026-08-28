SELECT u."email", r."name"
FROM "User" u
JOIN "UserRole" ur ON ur."userId" = u."id"
JOIN "Role" r ON r."id" = ur."roleId"
WHERE u."email" = 'admin@servana.app';