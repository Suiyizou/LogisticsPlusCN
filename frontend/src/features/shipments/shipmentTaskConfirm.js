import { ElMessageBox } from "element-plus";
import "element-plus/es/components/message-box/style/css";
import { shipmentTaskName } from "./shipmentTaskBatch.js";

export async function confirmShipmentTask(t, action, message) {
  const copy = (key) => t(`shipmentTask.${key}`);
  try {
    await ElMessageBox.confirm(message || copy(`${action}Confirm`), copy(action), {
      type: "warning",
      confirmButtonText: copy(action),
      cancelButtonText: copy("keepTask"),
      confirmButtonClass: action === "deleteTask" ? "el-button--danger" : undefined,
      closeOnClickModal: false
    });
    return true;
  } catch {
    return false;
  }
}

export function confirmShipmentTaskDeletion(t, task, dirty = false) {
  const message = t("shipmentTask.deleteTaskConfirm", {
    name: shipmentTaskName(task),
    count: task.total ?? 0,
    id: task.taskId
  });
  return confirmShipmentTask(t, "deleteTask", dirty
    ? `${message} ${t("shipmentTask.deleteUnsaved")}`
    : message);
}
