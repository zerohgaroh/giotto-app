export function createPendingTableNavigator(navigateToTable: (tableId: number) => void) {
  let pendingTableId: number | null = null;

  return {
    open(tableId: number, isReady: boolean) {
      if (!isReady) {
        pendingTableId = tableId;
        return false;
      }

      pendingTableId = null;
      navigateToTable(tableId);
      return true;
    },
    flush(isReady: boolean) {
      if (!isReady || pendingTableId === null) {
        return false;
      }

      const tableId = pendingTableId;
      pendingTableId = null;
      navigateToTable(tableId);
      return true;
    },
    peek() {
      return pendingTableId;
    },
  };
}
