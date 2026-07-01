let cachedSql = null;

export async function getSql() {
  if (cachedSql) return cachedSql;
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL 환경변수가 필요합니다.");
  }
  const { neon } = await import("@neondatabase/serverless");
  cachedSql = neon(process.env.DATABASE_URL);
  return cachedSql;
}

export function resetDbForTests() {
  cachedSql = null;
}
