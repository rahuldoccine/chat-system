# Prisma migrations (squashed)

Historical sprint migrations were consolidated into:

| Migration | Contents |
|-----------|----------|
| `20260417120000_baseline` | Full schema from `schema.prisma` (all tables, enums, indexes, FKs) |
| `20260417200000_seed_direct_e2ee` | Set `Chat.e2eeMode = DM_V1` for all direct chats |

## Fresh database

```bash
npm run db:migrate
```

## Existing database (already ran old migrations)

Squashing changes migration history. For **local dev** (data can be lost):

```bash
npx prisma migrate reset
```

For **production**, do not delete old migration folders without a coordinated baseline cutover.

## Adding schema changes later

```bash
npm run db:migrate:dev
```

This appends new migration folders; avoid one-column-one-folder when you can batch related `ALTER TABLE` changes in the same migration.
