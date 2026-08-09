-- Seed the "beverages" supply category (see prisma/seeds/SupplyItemCategory.csv).
INSERT INTO "SupplyItemCategory" ("id", "name", "slug", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES (
    gen_random_uuid()::text,
    '{"en":"Beverages","hi":"पेय पदार्थ","gu":"પીણાં"}',
    'beverages',
    11,
    true,
    NOW(),
    NOW()
)
ON CONFLICT ("slug") DO NOTHING;
