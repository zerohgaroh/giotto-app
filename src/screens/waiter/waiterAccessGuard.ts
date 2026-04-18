function extractStatus(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

export function shouldExitWaiterTableFlow(error: unknown) {
  const status = extractStatus(error);
  return status === 403 || status === 404;
}
