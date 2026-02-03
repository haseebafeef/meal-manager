import { handlers } from "@/auth"; // Referring to auth.ts at root or src?
// My auth.ts is in root d:/Projects/meal manager/auth.ts
// Checking aliases: tsconfig usually maps @/* to ./ or ./src
// I set --import-alias "@/*" --no-src-dir
// So @/auth should work if auth.ts is in root.
export const { GET, POST } = handlers;
