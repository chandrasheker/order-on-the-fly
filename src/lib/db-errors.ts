import { Prisma } from "@/generated/prisma/client";

export function isDatabaseNotReadyError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return (
      error.code === "P2021" ||
      error.message.includes("does not exist in the current database")
    );
  }
  if (error instanceof Error) {
    return error.message.includes("does not exist in the current database");
  }
  return false;
}
